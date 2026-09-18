import { screen } from '@testing-library/react'
import {renderWithProviders} from "@/test-utils/render";

it('renders with providers without crashing', () => {
    renderWithProviders(<div data-testid="smoke">ok</div>)
    expect(screen.getByTestId('smoke')).toBeInTheDocument()
})
