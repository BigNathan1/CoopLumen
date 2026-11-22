import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProposalDetail from '../ProposalDetail';

// Mock the useProposal hook following existing component test patterns.
jest.mock('../../hooks/useProposal', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const useProposal = require('../../hooks/useProposal').default as jest.Mock;

const baseProposal = {
  id: 'prop-1',
  title: 'Increase Community Treasury Allocation',
  description: 'A proposal to increase the treasury allocation for community grants.',
  status: 'active',
  votesFor: 300,
  votesAgainst: 100,
  votesAbstain: 100,
  totalVotes: 500,
  quorum: 400,
};

describe('ProposalDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the title, description, and status', () => {
    useProposal.mockReturnValue({
      proposal: baseProposal,
      loading: false,
      error: null,
    });

    render(<ProposalDetail proposalId="prop-1" />);

    expect(
      screen.getByRole('heading', { name: /increase community treasury allocation/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/a proposal to increase the treasury allocation/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
  });

  it('computes tally percentages correctly', () => {
    useProposal.mockReturnValue({
      proposal: baseProposal,
      loading: false,
      error: null,
    });

    render(<ProposalDetail proposalId="prop-1" />);

    // For: 300/500 = 60%, Against: 100/500 = 20%, Abstain: 100/500 = 20%
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getAllByText('20%')).toHaveLength(2);
  });

  it('renders the vote tally bar chart with accessible labels', () => {
    useProposal.mockReturnValue({
      proposal: baseProposal,
      loading: false,
      error: null,
    });

    render(<ProposalDetail proposalId="prop-1" />);

    const chart = screen.getByRole('img', { name: /vote tally/i });
    expect(chart).toBeInTheDocument();

    const forBar = screen.getByRole('progressbar', { name: /for.*60%/i });
    expect(forBar).toBeInTheDocument();
    expect(forBar).toHaveAttribute('aria-valuenow', '60');
    expect(forBar).toHaveAttribute('aria-valuemin', '0');
    expect(forBar).toHaveAttribute('aria-valuemax', '100');

    const againstBar = screen.getByRole('progressbar', { name: /against.*20%/i });
    expect(againstBar).toBeInTheDocument();
    expect(againstBar).toHaveAttribute('aria-valuenow', '20');

    const abstainBar = screen.getByRole('progressbar', { name: /abstain.*20%/i });
    expect(abstainBar).toBeInTheDocument();
    expect(abstainBar).toHaveAttribute('aria-valuenow', '20');
  });

  it('makes tally bars focusable for keyboard users', () => {
    useProposal.mockReturnValue({
      proposal: baseProposal,
      loading: false,
      error: null,
    });

    render(<ProposalDetail proposalId="prop-1" />);

    const bars = screen.getAllByRole('progressbar');
    expect(bars.length).toBeGreaterThan(0);
    bars.forEach((bar) => {
      expect(bar).toHaveAttribute('tabindex', '0');
    });
  });

  it('renders an empty state when there are no votes', () => {
    useProposal.mockReturnValue({
      proposal: {
        ...baseProposal,
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        totalVotes: 0,
      },
      loading: false,
      error: null,
    });

    render(<ProposalDetail proposalId="prop-1" />);

    expect(screen.getByText(/no votes have been cast yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders an error state when the proposal fails to load', () => {
    useProposal.mockReturnValue({
      proposal: null,
      loading: false,
      error: new Error('Failed to load proposal'),
    });

    render(<ProposalDetail proposalId="prop-1" />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(within(alert).getByText(/failed to load proposal/i)).toBeInTheDocument();
  });

  it('renders a loading state while the proposal is being fetched', () => {
    useProposal.mockReturnValue({
      proposal: null,
      loading: true,
      error: null,
    });

    render(<ProposalDetail proposalId="prop-1" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('exposes a labelled region for the proposal detail', () => {
    useProposal.mockReturnValue({
      proposal: baseProposal,
      loading: false,
      error: null,
    });

    render(<ProposalDetail proposalId="prop-1" />);

    const region = screen.getByRole('region', { name: /proposal detail/i });
    expect(region).toBeInTheDocument();
  });
});