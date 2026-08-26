#!/bin/bash
set -e

echo "Building shared package..."
cd packages/shared
npm install
npm run build

echo "Building backend package..."
cd ../backend
npm install
npm run build

echo "Build completed successfully!"
