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
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

//go:embed web collab
var embedded embed.FS

// Added to index.html; the static site never loads the collab add-on
const inject = `<link rel="stylesheet" href="collab/collab.css">
<script src="collab/collab.js"></script>
`

const instructions = `Edit the MOTD banner open in the user's browser, together with the user, who may be drawing at the same time and sees every change live.

The canvas is a grid of terminal character cells, addressed (x, y) from the top-left. Each cell is also 2x3 subpixels, addressed (sx, sy) = (2x + col, 3y + row), drawn with Unicode sextant characters; a cell holds either subpixels or one other character (text, box drawing, symbols). Colours are "#rrggbb" or "default" (the terminal's default; the default when omitted).

Start with get_state (canvas size, the user's selection and note to you). Look with view_canvas; use read_region for exact content. The banner will be shown in users' terminals, with dark or light backgrounds: "default" colours follow the terminal, so check both. Every drawing tool is one undo step for the user. Use batch to apply many operations at once.`

type editor struct {
	mu      sync.Mutex
	tab     chan []byte // events for the connected tab; nil when there is none
	nextID  int64
	pending map[int64]chan reply
}

type reply struct {
	Result json.RawMessage `json:"result"`
	Error  string          `json:"error"`
}

// call runs op in the connected tab and returns its result
func (e *editor) call(ctx context.Context, op string, args json.RawMessage) (json.RawMessage, error) {
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
		return nil, errors.New("no editor tab is connected: ask the user to open the editor URL printed by motd-editor")
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
		return nil, errors.New("the editor tab did not answer within 30 s")
	}
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
		done <- msg.reply
	}
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

// relay adds a tool that runs the tab operation of the same name. In only
// describes and validates the arguments; the tab gets them as sent.
func relay[In any](s *mcp.Server, e *editor, name, description string) {
	mcp.AddTool(s, &mcp.Tool{Name: name, Description: description},
		func(ctx context.Context, req *mcp.CallToolRequest, _ In) (*mcp.CallToolResult, any, error) {
			res, err := e.call(ctx, name, req.Params.Arguments)
			if err != nil {
				return nil, nil, err
			}
			return toolResult(res), nil, nil
		})
}

func main() {
	addr := flag.String("addr", "localhost:8765", "address to serve on")
	dev := flag.Bool("dev", false, "serve web/ and collab/ from the working directory instead of the built-in copy")
	flag.Parse()

	var files fs.FS = embedded
	if *dev {
		files = os.DirFS(".")
	}
	webFS, _ := fs.Sub(files, "web")

	e := &editor{pending: map[int64]chan reply{}}
	server := mcp.NewServer(&mcp.Implementation{Name: "motd-editor", Version: "0.1.0"},
		&mcp.ServerOptions{Instructions: instructions})
	addTools(server, e)

	mux := http.NewServeMux()
	mux.Handle("/mcp", mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil))
	mux.HandleFunc("GET /events", e.events)
	mux.HandleFunc("POST /result", e.result)
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

	log.Printf("Editor:      http://%s/", *addr)
	log.Printf("MCP server:  claude mcp add --transport http motd http://%s/mcp", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}
