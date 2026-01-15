import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { UnitProvider } from '@/lib/UnitContext';

interface ProvidersOptions extends RenderOptions {
  withUnitProvider?: boolean;
}

export function renderWithProviders(ui: ReactElement, options: ProvidersOptions = {}) {
  const { withUnitProvider = true, ...renderOptions } = options;
  if (!withUnitProvider) {
    return render(ui, renderOptions);
  }
  return render(ui, { wrapper: UnitProvider, ...renderOptions });
}
