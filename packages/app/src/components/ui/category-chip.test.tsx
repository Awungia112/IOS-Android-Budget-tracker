/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CategoryChip } from './category-chip';

// Mock category-icons
vi.mock('@/lib/category-icons', () => ({
  getIconPath: (key: string) => {
    const icons: Record<string, string> = {
      cash: '/categories/custom-category-icons/cash.svg',
    };
    // eslint-disable-next-line security/detect-object-injection -- key is validated enum value/safe access pattern
    return icons[key] || undefined;
  },
}));

describe('CategoryChip', () => {
  it('renders the label', () => {
    render(<CategoryChip label="Food" />);
    expect(screen.getByText('Food')).toBeInTheDocument();
  });

  it('renders an icon image when icon prop maps to a path', () => {
    render(<CategoryChip label="General" icon="cash" />);
    const img = screen.getByAltText('General');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/categories/custom-category-icons/cash.svg');
  });

  it('renders a color dot inside a circle when icon has no path', () => {
    const { container } = render(
      <CategoryChip label="Custom" icon="unknown" color="#FF0000" />,
    );
    // Now all icons are wrapped in CategoryAvatar which has .rounded-full
    const colorCircle = container.querySelector('.rounded-full');
    expect(colorCircle).toBeInTheDocument();
    expect(colorCircle).toHaveStyle({ backgroundColor: '#FF0000' });
  });

  it('uses default category color for the icon circle when no color provided', () => {
    const { container } = render(
      <CategoryChip label="Custom" />,
    );
    const colorCircle = container.querySelector('.rounded-full');
    expect(colorCircle).toBeInTheDocument();
    // Default color from CategoryAvatar fallback (#8B5CF6)
    expect(colorCircle).toHaveStyle({ backgroundColor: '#8B5CF6' });
  });

  it('applies selected state styling', () => {
    const { container } = render(
      <CategoryChip label="Food" selected />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('bg-[#3A464F]');
  });

  it('applies unselected state styling by default', () => {
    const { container } = render(
      <CategoryChip label="Food" />,
    );
    const button = container.querySelector('button');
    expect(button?.className).toContain('bg-white');
  });

  it('fires onClick handler', () => {
    const handleClick = vi.fn();
    render(<CategoryChip label="Food" onClick={handleClick} />);
    fireEvent.click(screen.getByText('Food'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a button element', () => {
    render(<CategoryChip label="Food" />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('renders Lucide icon inside a colored circle when categoryKey is provided', () => {
    const { container } = render(
      <CategoryChip label="Food" categoryKey="category_food" />,
    );
    // Should render a Lucide SVG inside a colored circle (.rounded-full)
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('.rounded-full')).toBeInTheDocument();
  });
});
