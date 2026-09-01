import { render, screen } from '@testing-library/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';

describe('Card', () => {
  it('renders card content and subcomponents', () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Community treasury</CardTitle>
          <CardDescription>Shared treasury information.</CardDescription>
        </CardHeader>

        <CardContent>Balance: 100 XLM</CardContent>

        <CardFooter>
          <button type="button">View details</button>
        </CardFooter>
      </Card>
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Community treasury' })).toBeInTheDocument();
    expect(screen.getByText('Shared treasury information.')).toBeInTheDocument();
    expect(screen.getByText('Balance: 100 XLM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View details' })).toBeInTheDocument();
  });

  it('forwards HTML attributes', () => {
    render(
      <Card aria-label="Treasury card" data-testid="card">
        Content
      </Card>
    );

    expect(screen.getByTestId('card')).toHaveAttribute('aria-label', 'Treasury card');
  });
});
