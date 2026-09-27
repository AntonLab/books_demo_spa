export interface BuildPaths {
  root: string;
  src: string;
  entry: string;
  output: string;
  html: string;
  favicon: string;
  sharedSrc: string;
}

export interface BuildOptions {
  isDevelopment: boolean;
  analyze: boolean;
  paths: BuildPaths;
}
