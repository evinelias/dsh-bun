/** Share the executable's module instances with plugins loaded from disk. */
import { plugin } from 'bun'

/**
 * Register embedded package exports with Bun before importing profile plugins.
 * @param modules - Lazy imports of the host's embedded modules, keyed by public package specifier.
 */
export function registerBuiltinModules(modules: Readonly<Record<string, () => Record<string, unknown>>>): void {
  plugin({
    name: 'dsh-embedded-modules',
    setup(builder) {
      for (const [specifier, load] of Object.entries(modules)) {
        builder.module(specifier, () => ({ loader: 'object', exports: load() }))
      }
    },
  })
}
