/** Cross-platform native single-directory chooser behind the native backend's capability. */

import { runNativeCommand, type NativeCommandRunner } from '@deepseek-ai/dsh-native-command'
import { pickWin32Directory } from './win32-dialog.ts'

/** Testable command boundary; native implementations never invoke a shell. */
export type DirectoryPickerRunner = NativeCommandRunner

/** Injectable platform facts for deterministic adapter tests. */
export interface DirectoryPickerInternals {
  platform?: NodeJS.Platform
  run?: DirectoryPickerRunner
  /** Replaces the in-process Win32 dialog (`pickWin32Directory`) for deterministic tests. */
  pickWin32Dialog?: (signal: AbortSignal) => Promise<string | null>
}

/** The prompt every native chooser shows. */
const DIALOG_TITLE = 'Select Workspace Directory'

/**
 * macOS panel source, run by the system JXA host (`osascript -l JavaScript`).
 *
 * A native panel resolves ⌘C/⌘V/⌘A/⌘X as main-menu key equivalents rather than
 * as focused-field behavior, so the script installs that menu before opening
 * `NSOpenPanel`; AppleScript's `choose folder` runs in a helper that has no
 * menu, which leaves every text field of its panel (Go to Folder, Search,
 * Tags) un-pastable. Menu items stay untargeted, so AppKit enables them
 * against the responder chain that owns the panel's field editor. The prompt
 * arrives as argv, never as executable source, and a cancel prints an empty
 * line instead of failing. A cancelled panel still reports its highlighted or
 * current directory in `URLs`, so only an OK response reads the selection.
 */
const MAC_PANEL = `
ObjC.import('AppKit');
function run(argv) {
  var app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  var mainMenu = $.NSMenu.alloc.init;
  mainMenu.addItem($.NSMenuItem.alloc.init);
  var editMenu = $.NSMenu.alloc.initWithTitle('Edit');
  var editItem = $.NSMenuItem.alloc.init;
  editItem.submenu = editMenu;
  mainMenu.addItem(editItem);
  editMenu.addItemWithTitleActionKeyEquivalent('Undo', 'undo:', 'z');
  editMenu.addItemWithTitleActionKeyEquivalent('Redo', 'redo:', 'Z');
  editMenu.addItemWithTitleActionKeyEquivalent('Cut', 'cut:', 'x');
  editMenu.addItemWithTitleActionKeyEquivalent('Copy', 'copy:', 'c');
  editMenu.addItemWithTitleActionKeyEquivalent('Paste', 'paste:', 'v');
  editMenu.addItemWithTitleActionKeyEquivalent('Select All', 'selectAll:', 'a');
  app.mainMenu = mainMenu;
  app.activateIgnoringOtherApps(true);
  var panel = $.NSOpenPanel.openPanel;
  panel.canChooseFiles = false;
  panel.canChooseDirectories = true;
  panel.canCreateDirectories = true;
  panel.allowsMultipleSelection = false;
  panel.message = argv[0];
  if (panel.runModal !== $.NSModalResponseOK) return '';
  var urls = panel.URLs;
  if (urls.count < 1) return '';
  return ObjC.unwrap(urls.objectAtIndex(0).path);
}`

function outputPath(stdout: string): string | null {
  const path = stdout.replace(/[\r\n]+$/, '')
  return path === '' ? null : path
}

function errorCode(error: unknown): string | number | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' || typeof code === 'number' ? code : undefined
}

function isMissingCommand(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}

function rethrowIfAborted(signal: AbortSignal, error: unknown): void {
  if (signal.aborted) throw error
}

/**
 * Open the platform directory picker.
 * @param signal - caller/connection lifetime; abort terminates the native command.
 * @param internals - Platform and runner hooks for deterministic tests.
 * @returns the selected path, or null when the user cancels.
 */
export async function pickNativeDirectory(
  signal: AbortSignal,
  internals: DirectoryPickerInternals = {},
): Promise<string | null> {
  const platform = internals.platform ?? process.platform
  const run = internals.run ?? runNativeCommand

  if (platform === 'darwin') {
    const result = await run('osascript', ['-l', 'JavaScript', '-e', MAC_PANEL, DIALOG_TITLE], signal, 'hidden')
    return outputPath(result.stdout)
  }

  if (platform === 'win32') {
    const isBun = 'Bun' in globalThis
    const pickDialog = internals.pickWin32Dialog ?? (isBun ? undefined : pickWin32Directory)
    if (pickDialog) {
      try {
        return await pickDialog(signal)
      } catch (err: unknown) {
        rethrowIfAborted(signal, err)
      }
    }
    try {
      const modernPickerScript = [
        'Add-Type -TypeDefinition @"',
        'using System;',
        'using System.Runtime.InteropServices;',
        '[ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")] class FileOpenDialogRCW {}',
        '[ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
        'interface IFileOpenDialog {',
        '  [PreserveSig] int Show(IntPtr parent);',
        '  [PreserveSig] int SetFileTypes();',
        '  [PreserveSig] int SetFileTypeIndex();',
        '  [PreserveSig] int GetFileTypeIndex();',
        '  [PreserveSig] int Advise();',
        '  [PreserveSig] int Unadvise();',
        '  [PreserveSig] int SetOptions(uint fos);',
        '  [PreserveSig] int GetOptions(out uint fos);',
        '  [PreserveSig] int SetDefaultFolder();',
        '  [PreserveSig] int SetFolder();',
        '  [PreserveSig] int GetFolder();',
        '  [PreserveSig] int GetCurrentSelection();',
        '  [PreserveSig] int SetFileName();',
        '  [PreserveSig] int GetFileName();',
        '  [PreserveSig] int SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);',
        '  [PreserveSig] int SetOkButtonLabel();',
        '  [PreserveSig] int SetFileNameLabel();',
        '  [PreserveSig] int GetResult(out IShellItem ppsi);',
        '}',
        '[ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
        'interface IShellItem {',
        '  [PreserveSig] int BindToHandler();',
        '  [PreserveSig] int GetParent();',
        '  [PreserveSig] int GetDisplayName(uint sigdnName, out IntPtr ppszName);',
        '  [PreserveSig] int GetAttributes();',
        '  [PreserveSig] int Compare();',
        '}',
        'public class ModernFolderPicker {',
        '  [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);',
        '  public static string Show(string title) {',
        '    var dlg = (IFileOpenDialog)new FileOpenDialogRCW();',
        '    dlg.SetTitle(title);',
        '    dlg.SetOptions(0x20 | 0x40 | 0x08);', // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR
        '    keybd_event(0x12, 0, 0, UIntPtr.Zero);',
        '    keybd_event(0x12, 0, 2, UIntPtr.Zero);',
        '    if (dlg.Show(IntPtr.Zero) != 0) return null;',
        '    IShellItem item;',
        '    if (dlg.GetResult(out item) != 0 || item == null) return null;',
        '    IntPtr pName;',
        '    if (item.GetDisplayName(0x80028000, out pName) != 0 || pName == IntPtr.Zero) return null;',
        '    string path = Marshal.PtrToStringUni(pName);',
        '    Marshal.FreeCoTaskMem(pName);',
        '    return path;',
        '  }',
        '}',
        '"@',
        `$res = [ModernFolderPicker]::Show('${DIALOG_TITLE}')`,
        'if ($res) { [Console]::Out.Write($res) }',
      ].join('\n')
      const encoded = Buffer.from(modernPickerScript, 'utf16le').toString('base64')
      const result = await run('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], signal, 'hidden')
      return outputPath(result.stdout)
    } catch (psErr: unknown) {
      rethrowIfAborted(signal, psErr)
      throw psErr
    }
  }

  if (platform === 'linux') {
    try {
      const result = await run('zenity', [
        '--file-selection', '--directory', `--title=${DIALOG_TITLE}`,
      ], signal, 'hidden')
      return outputPath(result.stdout)
    } catch (error: unknown) {
      rethrowIfAborted(signal, error)
      if (errorCode(error) === 1) return null
      if (!isMissingCommand(error)) throw error
    }

    try {
      const result = await run('kdialog', [
        '--getexistingdirectory', '.', '--title', DIALOG_TITLE,
      ], signal, 'hidden')
      return outputPath(result.stdout)
    } catch (error: unknown) {
      rethrowIfAborted(signal, error)
      if (errorCode(error) === 1) return null
      if (isMissingCommand(error)) {
        throw new Error('no supported native directory picker found (install zenity or kdialog)')
      }
      throw error
    }
  }

  throw new Error(`native directory picker is unsupported on ${platform}`)
}
