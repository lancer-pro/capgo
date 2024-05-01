
#!/usr/bin/env bash

set -e
set -x

# Install CocoaPods
echo "📦 Install CocoaPods"
brew install cocoapods
brew install node@18
brew install vips
brew link node@18

node -v
npm -v

# Force install deps to make build from source instead of prebuilt binaries
# https://sharp.pixelplumbing.com/install#custom-libvips
npm install -g node-gyp node-addon-api
# XCode Cloud is literally broken for 2 months now - https://developer.apple.com/forums/thread/738136?answerId=774510022#774510022

# Install bun
echo "📦 Install bun"
brew tap oven-sh/bun
brew install bun 
bun -v

echo "Move to the project root"
echo $PWD
cd ../../..
echo $PWD

# Install dependencies
echo "📦 Install dependencies"
bun install

# create assets
echo "🌆 Create Assets"

npm run capacitor-assets

# Build the app
echo "🚀 Build code"
npm run mobile

# install native dependencies
echo "📦 Install native dependencies"
npm run sync:ios


echo "Move back to the ci_scripts directory"
cd ios/App/ci_scripts
