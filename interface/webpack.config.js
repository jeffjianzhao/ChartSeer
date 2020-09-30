const path = require('path'),
      webpack = require('webpack'),
      CleanWebpackPlugin = require('clean-webpack-plugin'),
      HtmlWebpackPlugin = require('html-webpack-plugin'),
      ExtractTextPlugin = require('extract-text-webpack-plugin');

const extractPlugin = new ExtractTextPlugin({ filename: './assets/css/app.css' });

const config = {

  // absolute path for project root
  context: path.resolve(__dirname, 'client'),

  entry: {
    // relative path declaration
    app1: './app1.js'
  },

  output: {
    // absolute path declaration
    path: path.resolve(__dirname, 'public'),
    filename: './assets/js/[name].bundle.js'
  },

  module: {
    rules: [

      // babel-loader with 'env' preset
      { test: /\.js$/, include: /client/, exclude: /node_modules/, use: { loader: "babel-loader", options: { presets: ['@babel/preset-env'] } } },
      // html-loader
      { test: /\.html$/, use: ['html-loader'] },
      // sass-loader with sourceMap activated
      {
        test: /\.scss$/,
        include: [path.resolve(__dirname, 'client', 'assets', 'scss')],
        use: extractPlugin.extract({
          use: [
            {
              loader: 'css-loader',
              options: {
                sourceMap: true
              }
            },
            {
              loader: 'sass-loader',
              options: {
                sourceMap: true
              }
            }
          ],
          fallback: 'style-loader'
        })
      },
      // file-loader(for images)
      { test: /\.(jpg|png|gif|svg)$/, use: [ { loader: 'file-loader', options: { name: '[name].[ext]', outputPath: './assets/media/' } } ] },
      // file-loader(for fonts)
      { test: /\.(woff|woff2|eot|ttf|otf)$/, use: ['file-loader'] }

    ]
  },

  plugins: [
    new CleanWebpackPlugin(['public']),
    new HtmlWebpackPlugin({template: 'index.html', chunks: ['app1'], filename: 'index.html'}),
    extractPlugin
  ],

  // devServer: {
  //   // static files served from here
  //   contentBase: path.resolve(__dirname, "./public/assets/media"),
  //   compress: true,
  //   // open app in localhost:8000
  //   port: 8000,
  //   stats: 'errors-only',
  //   open: true
  // },

  devtool: 'eval-source-map',

  cache: true

};

module.exports = config;
