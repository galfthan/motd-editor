# Builds motd-editor (editor + MCP server, see README) for each platform into dist/
PLATFORMS := linux/amd64 linux/arm64 windows/amd64 darwin/amd64 darwin/arm64

all: $(PLATFORMS)

$(PLATFORMS):
	CGO_ENABLED=0 GOOS=$(@D) GOARCH=$(@F) go build -trimpath -ldflags=-s \
		-o dist/motd-editor-$(@D)-$(@F)$(if $(filter windows,$(@D)),.exe) .

clean:
	rm -rf dist

.PHONY: all clean $(PLATFORMS)
