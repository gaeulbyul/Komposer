NAME := Komposer
VERSION := $(shell jq .version src/manifest.json)
EXT_BUILD_DIR := build-ext
EXT_DIST_DIR := dist-ext
DESKTOP_BUILD_DIR := build-desktop
DESKTOP_DIST_DIR := dist-desktop

.PHONY: default build clean desktop zip srczip

default:
	@echo "$(NAME) $(VERSION)"
	@echo 'usage:'
	@echo '* make build: build extension'
	@echo '* make clean: clean extension dir'
	@echo '* make zip: compress extension into zip file'
	@echo '* make srczip: compress extension source into zip file (for upload to addons.mozilla.org)'
	@echo '* make desktop: TODO'
	@echo 'requirements: node, typescript'

build:
	rsync -av --exclude='*.ts' src/ $(EXT_BUILD_DIR)/
	tsc

clean:
	rm -rf $(EXT_BUILD_DIR)/ $(EXT_DIST_DIR)/
	rm -rf $(DESKTOP_BUILD_DIR)/ $(DESKTOP_DIST_DIR)/

desktop:
	yarn run dist

zip:
	mkdirp $(EXT_DIST_DIR)
	fd --type f .ts $(EXT_BUILD_DIR)/ --exec rm
	cd $(EXT_BUILD_DIR) && zip -9 -X -r --exclude='*.ts' ../$(EXT_DIST_DIR)/$(NAME)-v$(VERSION).zip .

srczip:
	git archive -9 -v -o ./$(EXT_DIST_DIR)/$(NAME)-v$(VERSION).Source.zip HEAD

