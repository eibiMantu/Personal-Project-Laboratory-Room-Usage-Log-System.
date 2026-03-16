import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f5f5f0] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-[32px] p-10 shadow-xl text-center space-y-6 border border-red-100">
            <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={40} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-serif font-bold text-gray-900">Something went wrong</h1>
              <p className="text-gray-500 text-sm">
                An unexpected error occurred. We've been notified and are looking into it.
              </p>
              {this.state.error && (
                <div className="mt-4 p-3 bg-gray-50 rounded-xl text-left overflow-auto max-h-32">
                  <code className="text-[10px] text-red-600 break-all">
                    {this.state.error.toString()}
                  </code>
                </div>
              )}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:bg-[#4a4a35] transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw size={20} /> Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
