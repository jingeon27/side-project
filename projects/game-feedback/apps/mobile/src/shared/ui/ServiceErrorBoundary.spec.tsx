import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Text, View } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceErrorBoundary } from './ServiceErrorBoundary';

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));

describe('mobile service boundary', () => {
  it('contains a render failure and recreates the failed native service on retry', () => {
    let failed = false;
    const createService = vi.fn(() => '새 서비스');
    function Service() {
      const [name] = useState(createService);
      if (failed) throw new Error('private native payload');
      return <Text>{name}</Text>;
    }
    function Screen() {
      return (
        <View>
          <Text>네이티브 셸</Text>
          <ServiceErrorBoundary>
            <Service />
          </ServiceErrorBoundary>
        </View>
      );
    }
    const { rerender } = render(<Screen />);
    failed = true;
    rerender(<Screen />);
    expect(screen.getByText('서비스 화면을 열지 못했어요')).toBeTruthy();
    expect(screen.getByText('네이티브 셸')).toBeTruthy();
    expect(screen.queryByText('private native payload')).toBeNull();
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: '서비스 다시 열기' }));
    expect(screen.getByText('새 서비스')).toBeTruthy();
    expect(createService).toHaveBeenCalledTimes(2);
  });

  it('keeps a persistent failure inside the recovery screen after retry', () => {
    function Service(): never {
      throw new Error('persistent');
    }
    render(
      <ServiceErrorBoundary>
        <Service />
      </ServiceErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: '서비스 다시 열기' }));
    expect(screen.getByText('서비스 화면을 열지 못했어요')).toBeTruthy();
  });
});
