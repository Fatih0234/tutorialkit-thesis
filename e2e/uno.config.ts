import { defineConfig } from '@tutorialkit/theme';

export default defineConfig({
  // required for TutorialKit monorepo development mode
  content: {
    pipeline: {
      include: [
        /packages\/react\/dist\/.*\.[jt]sx?$/,
        /packages\/astro\/dist\/.*\.[jt]sx?$/,
        /e2e\/src\/.*\.(astro|html|[jt]sx?)$/,
      ],
      exclude: [/node_modules\/\.pnpm\/@excalidraw\+excalidraw/],
    },
  },
});
