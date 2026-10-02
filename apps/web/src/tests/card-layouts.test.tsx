// The card primitive's laid-out faces (CardData.layout): a portrait card for
// a person and a station-sign card for a place, with pips or FREE for the
// cost, the emblem, the line bullet, the meter, the faces and the note.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Card } from '@universe/primitives';

afterEach(cleanup);

describe('card layouts', () => {
  it('draws a person as a portrait card, its cost as pips', () => {
    const { container } = render(<Card id="c" data={{
      label: 'Blackice', colorKey: 'gang_1', layout: 'portrait', costStyle: 'pips', cost: 2,
      artUrl: '/a.jpg', emblemUrl: '/m.svg', subtitle: 'Discard a Location.', badges: ['Iceden Collective'],
    }} />);
    const face = container.querySelector('.zk-card-face.layout-portrait') as HTMLElement;
    expect(face.style.getPropertyValue('--card-color')).toContain('--zekel-c-gang-1');
    expect(face.querySelector('.zk-card-pic img.zk-card-art')).not.toBeNull();
    expect(face.querySelector('.zk-card-pic img.zk-card-emblem')!.getAttribute('src')).toBe('/m.svg');
    expect(face.querySelectorAll('.zk-card-cost.pips .zk-card-pip')).toHaveLength(2);
    expect(face.querySelector('.zk-card-cost')!.getAttribute('aria-label')).toBe('costs 2');
    expect(face.querySelector('.zk-card-body .zk-card-label')!.textContent).toBe('Blackice');
  });

  it('says FREE for a cost of nothing', () => {
    const { container } = render(<Card id="c" data={{ label: 'Eddie', layout: 'portrait', costStyle: 'pips', cost: 0 }} />);
    expect(container.querySelector('.zk-card-cost.free')!.textContent).toBe('Free');
  });

  it('draws a place as a station sign with its bullet, bar, faces and stamp', () => {
    const { container } = render(<Card id="c" data={{
      label: 'The Junction', colorKey: 'gang_1', layout: 'sign', code: 'ICE', subtitle: 'Boonies',
      meter: { value: 2, max: 3 }, badges: ['Iceden Collective'], stamp: 'Not it',
      faces: [{ label: 'Blackice', artUrl: '/b.jpg' }, { label: 'Anansi' }],
    }} />);
    const face = container.querySelector('.zk-card-face.layout-sign')!;
    expect(face.querySelector('.zk-card-plate .zk-card-code')!.textContent).toBe('ICE');
    expect(face.querySelector('.zk-card-plate .zk-card-sub')!.textContent).toBe('Boonies');
    expect(face.querySelectorAll('.zk-card-meter-pip.on')).toHaveLength(2);
    expect([...face.querySelectorAll('.zk-card-face-pic')].map((f) => f.getAttribute('title'))).toEqual(['Blackice', 'Anansi']);
    expect(container.querySelector('.zk-card')!.getAttribute('aria-label')).toBe('The Junction, Not it');
    const quiet = render(<Card id="d" data={{ label: 'Shipyard', layout: 'sign', note: 'nobody home' }} />);
    expect(quiet.container.querySelector('.zk-card-note')!.textContent).toBe('nobody home');
  });

  it('leaves a card without a layout as it was: painted in its colour', () => {
    const { container } = render(<Card id="c" data={{ label: 'Plain', colorKey: 'red', cost: 3 }} />);
    const face = container.querySelector('.zk-card-face') as HTMLElement;
    expect(face.className).toBe('zk-card-face');
    expect(face.style.background).toContain('--zekel-c-red');
    expect(face.querySelector('.zk-card-cost')!.textContent).toBe('3');
  });
});
