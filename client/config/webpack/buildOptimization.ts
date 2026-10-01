import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import type { Configuration } from 'webpack';

export const buildOptimization = (): Configuration['optimization'] => ({
  // '...' keeps webpack's default JS minimizer (SWC/Terser) alongside the CSS
  // one.
  minimizer: ['...', new CssMinimizerPlugin()],
  // Keeps the webpack runtime out of the entry chunk so vendor hashes stay
  // stable across app-only changes.
  runtimeChunk: 'single',
  splitChunks: {
    cacheGroups: {
      vendors: {
        test: /[\\/]node_modules[\\/]/,
        name: 'vendors',
        // 'initial', not 'all': 'all' pulls every lazy page's libraries (antd
        // pickers, dnd-kit) into the first load.
        chunks: 'initial',
        maxSize: 250_000, // 250kb; split out large libraries (antd, dnd-kit) into their own chunks
      },
    },
  },
});
