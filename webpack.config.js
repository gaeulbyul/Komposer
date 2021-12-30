// const path = require('path')
// const webpack = require('webpack')

const mv2 = {
  // mode: 'development',
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
        use: require.resolve('swc-loader'),
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [],
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },
}

const mv3 = { ...mv2 }
mv3.output = {
  ...mv2.output,
  path: `${__dirname}/build-v3/bundled`,
}

module.exports = [mv2, mv3]
