const path = require('path')
const webpack = require('webpack')

module.exports = {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: './src/scripts/main.ts',
  output: {
    path: `${__dirname}/build/bundled`,
    filename: 'komposer.bun.js',
    // filename: '[name].bun.js',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        // use: 'ts-loader',
        use: 'swc-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [],
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },
  watchOptions: {
    poll: 1200,
  },
}
