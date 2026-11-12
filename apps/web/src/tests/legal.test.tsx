// The privacy policy and terms of service sit at their exact paths, and the
// footer on every page outside a game table links to both.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PrivacyPolicyPage, TermsOfServicePage, WithFooter } from '../pages/Legal';

afterEach(cleanup);

let path = '';
function Where() { path = useLocation().pathname; return null; }

function at(start: string) {
  render(
    <MemoryRouter initialEntries={[start]}>
      <Where />
      <Routes>
        <Route element={<WithFooter />}>
          <Route path="/" element={<p>home</p>} />
          <Route path="/privacy_policy" element={<PrivacyPolicyPage />} />
          <Route path="/terms_of_service" element={<TermsOfServicePage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('legal pages', () => {
  it('draws the privacy policy at /privacy_policy', () => {
    at('/privacy_policy');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeTruthy();
  });

  it('draws the terms of service at /terms_of_service', () => {
    at('/terms_of_service');
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeTruthy();
  });

  it('links both from the footer', () => {
    at('/');
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByRole('link', { name: 'Privacy policy' }).getAttribute('href')).toBe('/privacy_policy');
    fireEvent.click(footer.getByRole('link', { name: 'Terms of service' }));
    expect(path).toBe('/terms_of_service');
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeTruthy();
  });
});
