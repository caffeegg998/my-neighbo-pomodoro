// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { UpdatePanel } from './UpdatePanel';

vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getVersion).mockResolvedValue('0.2.0');
  vi.mocked(relaunch).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('checks for a signed update and waits for an active session before installing', async () => {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue('Macintosh');
  const downloadAndInstall = vi.fn(async () => {});
  vi.mocked(check).mockResolvedValue({ version: '0.2.1', body: 'New release', downloadAndInstall, close: vi.fn() } as unknown as Update);
  const view = render(<UpdatePanel language="en" native timerActive />);

  fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
  await screen.findByText('Version 0.2.1 is available');
  expect(screen.getByRole('button', { name: 'Download and install' }).hasAttribute('disabled')).toBe(true);
  expect(downloadAndInstall).not.toHaveBeenCalled();

  view.rerender(<UpdatePanel language="en" native timerActive={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Download and install' }));
  await waitFor(() => expect(downloadAndInstall).toHaveBeenCalledOnce());
  await waitFor(() => expect(relaunch).toHaveBeenCalledOnce());
});

it('does not offer desktop updates in the browser preview', () => {
  render(<UpdatePanel language="vi" native={false} timerActive={false} />);
  expect(screen.getByText('Chỉ ứng dụng máy tính mới hỗ trợ cập nhật.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Kiểm tra cập nhật' }).hasAttribute('disabled')).toBe(true);
  expect(check).not.toHaveBeenCalled();
});
