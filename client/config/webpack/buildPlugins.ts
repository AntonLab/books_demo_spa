import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import type { Configuration } from 'webpack';

import type { BuildOptions } from './types.ts';

export const buildPlugins = ({
  isDevelopment,
  paths,
}: BuildOptions): Configuration['plugins'] => [
  new HtmlWebpackPlugin({
    template: paths.html,
    // Emits the file into the build and injects its <link rel="icon">, so no
    // asset rule or static folder is needed.
    favicon: paths.favicon,
    minify: !isDevelopment,
  }),
  isDevelopment
    ? new ReactRefreshWebpackPlugin({ overlay: false })
    : new MiniCssExtractPlugin({
        filename: 'static/css/[name].[contenthash:8].css',
        chunkFilename: 'static/css/[name].[contenthash:8].chunk.css',
      }),
];
