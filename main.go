// Command motd-editor serves the MOTD editor locally and exposes it to AI
// agents over MCP, so a human and an agent can work on the same canvas.
//
// The browser tab holds the canvas. Each MCP tool call is relayed to the tab
// over Server-Sent Events (/events), run there by collab/collab.js with the
// editor's own code, and its result posted back (/result).
package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

//go:embed web collab
var embedded embed.FS

// Added to index.html; the static site never loads the collab add-on
const inject = `<link rel="stylesheet" href="collab/collab.css">
<script src="collab/collab.js"></script>
`

const instructions = `Edit the MOTD banner open in the user's browser, together with the user, who may be drawing at the same time and sees every change live.

The canvas is a grid of terminal character cells, addressed (x, y) from the top-left. Each cell is also 2x3 subpixels, addressed (sx, sy) = (2x + col, 3y + row), drawn with Unicode sextant characters; a cell holds either subpixels or one other character (text, box drawing, symbols). Colours are "#rrggbb", "default" (the terminal's default; the default when omitted) or "keep" (each cell keeps the colour it has). Drawing tools give the cells they draw on both colours, so to draw over a coloured background use bg: keep.

Start with get_state (canvas size, the user's selection and note to you). Look with view_canvas; use read_region for exact content. The banner will be shown in users' terminals, with dark or light backgrounds: "default" colours follow the terminal, so check both. Terminals also differ in cell shape: get_state's display.cell_aspect (cell width / height) is what the editor previews, so check it before doing geometry (circles, diagonals), and compare aspects with view_canvas's cell_aspect. Put photos and other pictures on the canvas with import_image. Every drawing tool is one undo step for the user. Use batch to apply many operations at once.`

type editor struct {
	url     string // where the editor is served
	mu      sync.Mutex
	tab     chan []byte // events for the connected tab; nil when there is none
	nextID  int64
	pending map[int64]chan reply
}

type reply struct {
	Result json.RawMessage `json:"result"`
	Error  string          `json:"error"`
}

// call runs op in the connected tab and returns its result. A tab that is
// (re)connecting gets a few seconds.
func (e *editor) call(ctx context.Context, op string, args json.RawMessage) (json.RawMessage, error) {
	for i := 0; i < 50 && !e.connected(); i++ {
		time.Sleep(100 * time.Millisecond)
	}
	done := make(chan reply, 1)
	e.mu.Lock()
	e.nextID++
	id := e.nextID
	msg, _ := json.Marshal(map[string]any{"id": id, "op": op, "args": args})
	sent := false
	if e.tab != nil {
		select {
		case e.tab <- msg:
			sent = true
			e.pending[id] = done
		default:
		}
	}
	e.mu.Unlock()
	if !sent {
		return nil, fmt.Errorf("no editor tab is connected, so nothing was changed: ask the user to open %s", e.url)
	}
	defer func() {
		e.mu.Lock()
		delete(e.pending, id)
		e.mu.Unlock()
	}()

	select {
	case r := <-done:
		if r.Error != "" {
			return nil, errors.New(r.Error)
		}
		return r.Result, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(30 * time.Second):
		return nil, errors.New("the editor tab did not answer within 30 s; the change may still have been made: check with get_state or read_region")
	}
}

func (e *editor) connected() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.tab != nil
}

// events streams operations to the tab. The newest tab takes over; the one it
// replaces gets a "replaced" event.
func (e *editor) events(w http.ResponseWriter, r *http.Request) {
	ch := make(chan []byte, 16)
	e.mu.Lock()
	if e.tab != nil {
		close(e.tab)
	}
	e.tab = ch
	e.mu.Unlock()
	defer func() {
		e.mu.Lock()
		if e.tab == ch {
			e.tab = nil
		}
		e.mu.Unlock()
	}()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	rc := http.NewResponseController(w)
	fmt.Fprint(w, ": connected\n\n")
	ping := time.NewTicker(15 * time.Second)
	defer ping.Stop()
	for {
		if rc.Flush() != nil {
			return
		}
		select {
		case msg, ok := <-ch:
			if !ok {
				fmt.Fprint(w, "event: replaced\ndata:\n\n")
				rc.Flush()
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", msg)
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
		case <-r.Context().Done():
			return
		}
	}
}

func (e *editor) result(w http.ResponseWriter, r *http.Request) {
	var msg struct {
		ID int64 `json:"id"`
		reply
	}
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	e.mu.Lock()
	done := e.pending[msg.ID]
	e.mu.Unlock()
	if done != nil {
		select {
		case done <- msg.reply:
		default: // already answered
		}
	}
}

// callHandler runs an operation for another motd-editor process (see link)
func (e *editor) callHandler(w http.ResponseWriter, r *http.Request) {
	var c struct {
		Op   string          `json:"op"`
		Args json.RawMessage `json:"args"`
	}
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var rep reply
	var err error
	if rep.Result, err = e.call(r.Context(), c.Op, c.Args); err != nil {
		rep.Error = err.Error()
	}
	json.NewEncoder(w).Encode(rep)
}

// link is how this process's tools reach the tab. Only one process can serve
// the editor on the port, but there may be several: Claude Desktop starts one
// per kind of session, and the user may run one by hand. The one with the
// port runs operations itself; the others pass them on to it over HTTP, and
// take the port over if it has gone away.
type link struct {
	e       *editor
	addr    string
	handler http.Handler
	mu      sync.Mutex
	serving bool
}

// serve starts serving the editor unless this process already does; false
// when another process has the port
func (l *link) serve() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.serving {
		return true
	}
	ln, err := net.Listen("tcp", l.addr)
	if err != nil {
		return false
	}
	l.serving = true
	log.Printf("Editor:      %s", l.e.url)
	go func() { log.Fatal(http.Serve(ln, l.handler)) }()
	return true
}

func (l *link) call(ctx context.Context, op string, args json.RawMessage) (json.RawMessage, error) {
	body, _ := json.Marshal(map[string]any{"op": op, "args": args})
	var err error
	// A second try when the process serving the editor has gone away: this
	// one takes the port over, or passes the operation on to the process
	// that just did
	for try := 0; try < 2; try++ {
		if l.serve() {
			return l.e.call(ctx, op, args)
		}
		req, _ := http.NewRequestWithContext(ctx, "POST", "http://"+l.addr+"/call", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		var resp *http.Response
		if resp, err = http.DefaultClient.Do(req); err != nil {
			continue
		}
		defer resp.Body.Close()
		var r reply
		if json.NewDecoder(resp.Body).Decode(&r) != nil {
			return nil, fmt.Errorf("%s is in use by something other than motd-editor: start it with another -addr", l.addr)
		}
		if r.Error != "" {
			return nil, errors.New(r.Error)
		}
		return r.Result, nil
	}
	return nil, err
}

// localOnly rejects requests from other sites' pages (cross-origin, any
// method: opening /events takes the AI link over) and for host names other
// than localhost (DNS rebinding), so only the editor page and local tools
// can drive the editor
func localOnly(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.Host)
		if err != nil {
			host = r.Host
		}
		site := r.Header.Get("Sec-Fetch-Site")
		origin, _ := url.Parse(r.Header.Get("Origin"))
		if host != "localhost" && net.ParseIP(host) == nil ||
			site == "cross-site" || site == "same-site" ||
			origin != nil && origin.Host != "" && origin.Host != r.Host {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		h.ServeHTTP(w, r)
	})
}

// toolResult turns a tab result into MCP content: a string as text, an
// {image, info} object as a PNG plus text, anything else as JSON text
func toolResult(raw json.RawMessage) *mcp.CallToolResult {
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}
	}
	var img struct {
		Image []byte `json:"image"`
		Info  string `json:"info"`
	}
	if json.Unmarshal(raw, &img) == nil && img.Image != nil {
		return &mcp.CallToolResult{Content: []mcp.Content{
			&mcp.ImageContent{Data: img.Image, MIMEType: "image/png"},
			&mcp.TextContent{Text: img.Info},
		}}
	}
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(raw)}}}
}

// preparer is an In that turns the arguments into the ones the tab gets
// (e.g. reading a file the tab can't)
type preparer interface {
	prepare(context.Context) (any, error)
}

// relay adds a tool that runs the tab operation of the same name. In
// describes and validates the arguments; the tab gets them as sent, or as
// In's prepare returns them.
func relay[In any](s *mcp.Server, l *link, name, description string) {
	schema, err := jsonschema.For[In](nil)
	if err != nil {
		panic(err)
	}
	notNull(schema)
	mcp.AddTool(s, &mcp.Tool{Name: name, Description: description, InputSchema: schema},
		func(ctx context.Context, req *mcp.CallToolRequest, in In) (*mcp.CallToolResult, any, error) {
			args := req.Params.Arguments
			if p, ok := any(in).(preparer); ok {
				v, err := p.prepare(ctx)
				if err != nil {
					return nil, nil, err
				}
				args, _ = json.Marshal(v)
			}
			res, err := l.call(ctx, name, args)
			if err != nil {
				return nil, nil, err
			}
			return toolResult(res), nil, nil
		})
}

// notNull gives the nullable types inferred for Go pointers and slices
// (["null", "boolean"]) their plain type: some clients (Claude Desktop) drop
// a list of types, leaving the argument untyped. Absent arguments, not null
// ones, mean "default".
func notNull(s *jsonschema.Schema) {
	if s == nil {
		return
	}
	if len(s.Types) == 2 && s.Types[0] == "null" {
		s.Type, s.Types = s.Types[1], nil
	}
	notNull(s.Items)
	for _, p := range s.Properties {
		notNull(p)
	}
}

func main() {
	addr := flag.String("addr", "localhost:8765", "address to serve on")
	dev := flag.Bool("dev", false, "serve web/ and collab/ from the working directory instead of the built-in copy")
	stdio := flag.Bool("stdio", false, "talk MCP over stdin/stdout, for clients that start the server themselves (Claude Desktop)")
	flag.Parse()

	var files fs.FS = embedded
	if *dev {
		files = os.DirFS(".")
	}
	webFS, _ := fs.Sub(files, "web")

	e := &editor{url: "http://" + *addr + "/", pending: map[int64]chan reply{}}
	var server *mcp.Server
	var l *link
	server = mcp.NewServer(&mcp.Implementation{Name: "motd-editor", Version: "0.1.0"}, &mcp.ServerOptions{
		Instructions: instructions + fmt.Sprintf(
			"\n\nThe editor runs at %s, in a browser tab the user keeps open. If a tool says no editor tab is connected, nothing was changed: ask the user to open that address.", e.url),
		// A client that reconnects, e.g. to a rebuilt server, may keep the
		// tool descriptions it had: adding the tools again tells every client
		// the list changed, so clients that follow that fetch it again
		InitializedHandler: func(context.Context, *mcp.InitializedRequest) { addTools(server, l) },
	})

	mux := http.NewServeMux()
	mux.Handle("/mcp", mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil))
	mux.HandleFunc("GET /events", e.events)
	mux.HandleFunc("POST /result", e.result)
	mux.HandleFunc("POST /call", e.callHandler)
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		page, err := fs.ReadFile(webFS, "index.html")
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(bytes.Replace(page, []byte("</body>"), []byte(inject+"</body>"), 1))
	})
	mux.Handle("/collab/", http.FileServerFS(files))
	mux.Handle("/", http.FileServerFS(webFS))

	l = &link{e: e, addr: *addr, handler: localOnly(mux)}
	addTools(server, l)

	if !*stdio {
		l.serving = true
		log.Printf("Editor:      %s", e.url)
		log.Printf("MCP server:  claude mcp add --transport http motd http://%s/mcp", *addr)
		log.Fatal(http.ListenAndServe(*addr, l.handler))
	}
	// The MCP session ends when the client closes stdin (logs go to stderr)
	if !l.serve() {
		log.Printf("Another motd-editor serves %s: passing operations on to it", e.url)
	}
	if err := server.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatal(err)
	}
}
