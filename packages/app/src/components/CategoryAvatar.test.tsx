/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CategoryAvatar, getCategoryIcon } from './CategoryAvatar';

// Mock category-icons to avoid core dependency issues
vi.mock('@/lib/category-icons', () => ({
  getIconPath: (key: string) => {
    const icons: Record<string, string> = {
      cash: '/categories/custom-category-icons/cash.svg',
      money: '/categories/custom-category-icons/money.svg',
    };
    // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
    return icons[key] || undefined;
  },
}));

describe('getCategoryIcon', () => {
  it('returns a Lucide icon for known category key "shopping"', () => {
    const { container } = render(<>{getCategoryIcon('shopping')}</>);
    // ShoppingBag renders an SVG
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('returns a Lucide icon for "food"', () => {
    const { container } = render(<>{getCategoryIcon('food')}</>);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('returns fallback text for unknown category', () => {
    const { container } = render(<>{getCategoryIcon('ZZZUnknown')}</>);
    const fallback = container.querySelector('span');
    expect(fallback).toBeInTheDocument();
    expect(fallback?.textContent).toBe('Z');
  });

  it('normalizes category_ prefix before lookup', () => {
    const { container } = render(<>{getCategoryIcon('category_food')}</>);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('returns an SVG for "books"', () => {
    const { container } = render(<>{getCategoryIcon('books')}</>);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('returns an SVG for "holiday_job"', () => {
    const { container } = render(<>{getCategoryIcon('holiday_job')}</>);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('returns an SVG for "transfer"', () => {
    const { container } = render(<>{getCategoryIcon('transfer')}</>);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('accepts strokeWidth parameter', () => {
    const { container } = render(<>{getCategoryIcon('food', 1)}</>);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute('stroke-width')).toBe('1');
  });
});

describe('CategoryAvatar', () => {
  it('renders with correct size', () => {
    const { container } = render(
      <CategoryAvatar categoryKey="food" size={48} />,
    );
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.style.width).toBe('48px');
    expect(avatar.style.height).toBe('48px');
  });

  it('renders with default size of 40', () => {
    const { container } = render(
      <CategoryAvatar categoryKey="food" />,
    );
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.style.width).toBe('40px');
    expect(avatar.style.height).toBe('40px');
  });

  it('applies custom className', () => {
    const { container } = render(
      <CategoryAvatar categoryKey="food" className="my-custom" />,
    );
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('my-custom');
  });

  it('renders an SVG icon from icon prop when provided', () => {
    render(
      <CategoryAvatar categoryKey="food" icon="cash" />,
    );
    const img = screen.getByAltText('food');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/categories/custom-category-icons/cash.svg');
  });

  it('falls back to Lucide icon when icon prop has no matching path', () => {
    const { container } = render(
      <CategoryAvatar categoryKey="food" icon="nonexistent" />,
    );
    // No img, should fall back to getCategoryIcon
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies background color from getCategoryColor', () => {
    const { container } = render(
      <CategoryAvatar categoryKey="shopping" />,
    );
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.style.backgroundColor).toBeTruthy();
  });
});
