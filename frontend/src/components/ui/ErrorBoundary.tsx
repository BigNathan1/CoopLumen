'use client';

import React from 'react';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Global error boundary component that catches unhandled React errors
 * and displays an accessible fallback UI using design system tokens.
 *
 * This is a class component because error boundaries must be class components
 * with getDerivedStateFromError and componentDidCatch lifecycle methods.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details for debugging (in production, send to error tracking service)
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.iconContainer}>
              <span className={styles.icon}>⚠️</span>
            </div>
            <h1 className={styles.title}>Something went wrong</h1>
            <p className={styles.message}>We encountered an unexpected error. Please try again.</p>
            {this.state.error && (
              <details className={styles.details}>
                <summary className={styles.summary}>Error details</summary>
                <pre className={styles.errorText}>{this.state.error.toString()}</pre>
                {this.state.errorInfo && (
                  <pre className={styles.errorText}>{this.state.errorInfo.componentStack}</pre>
                )}
              </details>
            )}
            <button onClick={this.resetError} className={styles.button}>
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
