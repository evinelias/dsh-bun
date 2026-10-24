import basePatchYml from '../../../../packages/bundle/base/cordis.patch.yml' with { type: 'text' }
import webAppPatchYml from '../../../../packages/bundle/web-app/cordis.patch.yml' with { type: 'text' }
import standardPatchYml from '../../../../packages/bundle/web-app/presets/standard.patch.yml' with { type: 'text' }
import ptcPatchYml from '../../../../packages/bundle/web-app/presets/ptc.patch.yml' with { type: 'text' }
import minimalPatchYml from '../../../../packages/bundle/web-app/presets/minimal.patch.yml' with { type: 'text' }
import cordisPatchYml from '../../../../packages/bundle/web-app/presets/cordis.patch.yml' with { type: 'text' }
import headlessPatchYml from '../../../../packages/bundle/headless/cordis.patch.yml' with { type: 'text' }

export interface BuiltinBundleDef {
  manifest: {
    name: string
    version: string
    dsh?: {
      bundle?: {
        patch: string | string[]
      }
    }
  }
  patches: { file: string; content: string }[]
}

export const BUILTIN_BUNDLES: Record<string, BuiltinBundleDef> = {
  '@deepseek-ai/dsh-base': {
    manifest: {
      name: '@deepseek-ai/dsh-base',
      version: '0.2.1-rc.3',
      dsh: {
        bundle: {
          patch: './cordis.patch.yml',
        },
      },
    },
    patches: [
      { file: 'packages/bundle/base/cordis.patch.yml', content: basePatchYml },
    ],
  },
  '@deepseek-ai/dsh-web-app': {
    manifest: {
      name: '@deepseek-ai/dsh-web-app',
      version: '0.2.1-rc.3',
      dsh: {
        bundle: {
          patch: [
            './cordis.patch.yml',
            './presets/standard.patch.yml',
            './presets/ptc.patch.yml',
            './presets/minimal.patch.yml',
            './presets/cordis.patch.yml',
          ],
        },
      },
    },
    patches: [
      { file: 'packages/bundle/web-app/cordis.patch.yml', content: webAppPatchYml },
      { file: 'packages/bundle/web-app/presets/standard.patch.yml', content: standardPatchYml },
      { file: 'packages/bundle/web-app/presets/ptc.patch.yml', content: ptcPatchYml },
      { file: 'packages/bundle/web-app/presets/minimal.patch.yml', content: minimalPatchYml },
      { file: 'packages/bundle/web-app/presets/cordis.patch.yml', content: cordisPatchYml },
    ],
  },
  '@deepseek-ai/dsh-headless': {
    manifest: {
      name: '@deepseek-ai/dsh-headless',
      version: '0.2.1-rc.3',
      dsh: {
        bundle: {
          patch: './cordis.patch.yml',
        },
      },
    },
    patches: [
      { file: 'packages/bundle/headless/cordis.patch.yml', content: headlessPatchYml },
    ],
  },
}
