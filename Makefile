# Marp CLI: brew install marp-cli (or npx @marp-team/marp-cli)
MARP ?= marp --no-stdin

.PHONY: all html pdf serve clean

all: html pdf

html: dist/index.html
pdf: dist/slides.pdf

node_modules: package.json package-lock.json
	npm ci
	@touch $@

dist/index.html: slides.md themes/*.css marp.config.mjs node_modules
	$(MARP) slides.md -o $@

dist/slides.pdf: slides.md themes/*.css marp.config.mjs node_modules
	$(MARP) slides.md --pdf -o $@

serve: node_modules
	$(MARP) -s .

clean:
	rm -rf dist
