import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./components/visualisations/Lab1Layout.js', () => () => null);

test('renders login screen', () => {
  render(<App />);
  const title = screen.getByText(/Spark Visualisations/i);
  expect(title).toBeInTheDocument();
});
