import { track } from '@amplitude/analytics-react-native';
import { fireEvent, render, screen } from '@testing-library/react';
import { openURL } from 'expo-linking';
import { describe, expect, it, vi } from 'vitest';

import { UpdateRequiredPageTemplate } from './UpdateRequiredPageTemplate';

describe('UpdateRequiredPageTemplate', () => {
  it('현재 버전과 필요한 버전을 보여 주고 스토어로 보내야 한다', () => {
    const onShown = vi.fn();
    render(
      <UpdateRequiredPageTemplate
        currentVersion="1.0.0"
        minimumVersion="1.2.0"
        storeUrl="market://details?id=dev.side.photocontest"
        onShown={onShown}
      />,
    );

    expect(screen.getByRole('heading', { name: '새 버전으로 업데이트해 주세요' })).toBeTruthy();
    expect(screen.getByText('현재 버전 1.0.0 · 필요한 버전 1.2.0 이상')).toBeTruthy();
    expect(onShown).toHaveBeenCalled();
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('update_required_shown', { minimum_version: '1.2.0' });

    fireEvent.click(screen.getByRole('button', { name: '업데이트하기' }));

    expect(openURL).toHaveBeenCalledWith('market://details?id=dev.side.photocontest');
  });

  it('스토어 주소를 모르면 업데이트 버튼을 숨겨야 한다', () => {
    render(
      <UpdateRequiredPageTemplate
        currentVersion="1.0.0"
        minimumVersion="2.0.0"
        storeUrl={null}
        onShown={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: '업데이트하기' })).toBeNull();
  });
});
