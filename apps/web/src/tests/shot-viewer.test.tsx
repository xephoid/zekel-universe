// The game page's screenshot viewer: a dialog over the page that steps
// through the game's screenshots (wrapping), by button, arrow key or swipe,
// and closes by the X, the backdrop or Escape.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ShotViewer } from '../pages/ShotViewer';

afterEach(cleanup);

const shots = ['/a.webp', '/b.webp', '/c.webp', '/d.webp'];
const shown = () => (screen.getByRole('dialog').querySelector('.shot-frame img') as HTMLImageElement).getAttribute('src');

describe('ShotViewer', () => {
  it('opens on the pressed screenshot as a modal dialog, and steps both ways with wrap-around', () => {
    render(<ShotViewer name="Fractured Fist" shots={shots} start={1} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Fractured Fist, screenshot 2 of 4' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(shown()).toBe('/b.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Next screenshot' }));
    expect(shown()).toBe('/c.webp');
    expect(dialog.textContent).toContain('3 of 4');
    fireEvent.click(screen.getByRole('button', { name: 'Next screenshot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next screenshot' }));
    expect(shown()).toBe('/a.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Previous screenshot' }));
    expect(shown()).toBe('/d.webp');
  });

  it('steps with the arrow keys and by a sideways swipe, not a tap', () => {
    render(<ShotViewer name="Fractured Fist" shots={shots} start={0} onClose={() => {}} />);
    act(() => { fireEvent.keyDown(document, { key: 'ArrowRight' }); });
    expect(shown()).toBe('/b.webp');
    act(() => { fireEvent.keyDown(document, { key: 'ArrowLeft' }); });
    expect(shown()).toBe('/a.webp');
    const frame = screen.getByRole('dialog').querySelector('.shot-frame')!;
    fireEvent.pointerDown(frame, { clientX: 300 });
    fireEvent.pointerUp(frame, { clientX: 200 });
    expect(shown()).toBe('/b.webp');
    fireEvent.pointerDown(frame, { clientX: 200 });
    fireEvent.pointerUp(frame, { clientX: 210 });
    expect(shown()).toBe('/b.webp');
  });

  it('closes by the X, by Escape and by the backdrop, but not by a click on the picture', () => {
    const onClose = vi.fn();
    const { container } = render(<ShotViewer name="Fractured Fist" shots={shots} start={0} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog').querySelector('.shot-frame img')!);
    expect(onClose).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2); // once, not once per listener
    // Escape with focus outside the dialog closes it too.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
    fireEvent.click(container.querySelector('.sheet-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('has no previous or next with a single screenshot, and keeps the page from scrolling while open', () => {
    const { unmount } = render(<ShotViewer name="Word Debauchee" shots={['/only.webp']} start={0} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Word Debauchee, screenshot' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next screenshot' })).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
