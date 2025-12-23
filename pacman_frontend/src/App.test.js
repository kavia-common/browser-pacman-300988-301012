import { render, screen } from '@testing-library/react';
import App from './App';

test('renders topbar labels', () => {
  render(<App />);
  expect(screen.getByText(/Score/i)).toBeInTheDocument();
  expect(screen.getByText(/Level/i)).toBeInTheDocument();
  expect(screen.getByText(/Lives/i)).toBeInTheDocument();
});
