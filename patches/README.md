# Dependency compatibility patches

`@rollup__plugin-terser@1.0.0.patch` fixes a zero-worker case in the production minifier used by Workbox. The upstream worker pool selects `options.maxWorkers || os.cpus().length`. Some restricted build environments return an empty CPU list even when Node can execute worker threads. In that case the unpatched pool starts no workers and leaves Rollup's `renderChunk` promise unresolved.

The patch adds a final fallback of one worker in the package's CommonJS, ES module, and TypeScript source. Ordinary CPU enumeration and explicit worker settings retain their original behavior. Production minification stays enabled; service worker logic and application build mode do not change.

`pnpm-workspace.yaml` registers the patch and `pnpm-lock.yaml` fixes its hash. Keep this directory in the source archive and Docker build context, and copy it before the frozen dependency installation. When upgrading the package, check whether upstream provides an equivalent nonzero fallback, then update or remove the patch and rerun the complete production build and offline tests.

The reproduced environment returned zero entries from `os.cpus()` and nine from `os.availableParallelism()`. After applying the patch, Workbox generated the minified production worker successfully with the complete post-SEO manifest.
