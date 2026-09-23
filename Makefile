# Marp CLI: brew install marp-cli (or npx @marp-team/marp-cli)
MARP ?= marp

.PHONY: all html pdf serve clean

all: html pdf

html: dist/index.html
pdf: dist/slides.pdf

dist/index.html: slides.md themes/*.css
	$(MARP) slides.md -o $@

dist/slides.pdf: slides.md themes/*.css
	$(MARP) slides.md --pdf -o $@

serve:
	$(MARP) -s .

clean:
	rm -rf dist
