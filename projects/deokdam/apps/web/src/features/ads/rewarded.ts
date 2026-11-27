/// <reference types="google-publisher-tag" />

const scriptId = 'deokdam-google-publisher-tag';
const scriptUrl = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';

function loadPublisherTag() {
  if (window.googletag?.apiReady) return Promise.resolve();
  window.googletag ??= { cmd: [] } as unknown as typeof googletag;
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(scriptId);
    const script = existing ?? document.createElement('script');
    const handleError = () => {
      script.remove();
      clearTimeout(timeout);
      reject(new Error('Ad script unavailable'));
    };
    const timeout = setTimeout(handleError, 8_000);
    script.addEventListener('error', handleError, { once: true });
    window.googletag.cmd.push(() => {
      clearTimeout(timeout);
      script.removeEventListener('error', handleError);
      resolve();
    });
    if (existing) return;
    script.id = scriptId;
    script.setAttribute('src', scriptUrl);
    script.setAttribute('async', '');
    script.setAttribute('crossorigin', 'anonymous');
    document.head.append(script);
  });
}

export async function playRewardedAd(unit: string, signal: AbortSignal, grant: () => void) {
  await loadPublisherTag();
  signal.throwIfAborted();

  const ads = googletag.pubads();
  const slot = googletag.defineOutOfPageSlot(unit, googletag.enums.OutOfPageFormat.REWARDED);
  if (!slot) throw new Error('Rewarded slot unavailable');
  slot.addService(ads);
  ads.setPrivacySettings({ nonPersonalizedAds: true });

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', handleAbort);
      ads.removeEventListener('rewardedSlotReady', handleReady);
      ads.removeEventListener('rewardedSlotGranted', handleGrant);
      ads.removeEventListener('rewardedSlotClosed', handleClose);
      ads.removeEventListener('slotRenderEnded', handleNoFill);
      googletag.destroySlots([slot]);
    };
    const unavailable = () => {
      cleanup();
      reject(new Error('No rewarded ad is available'));
    };
    const handleAbort = () => {
      cleanup();
      reject(signal.reason);
    };
    const handleReady = (message: googletag.events.RewardedSlotReadyEvent) => {
      if (message.slot !== slot) return;
      clearTimeout(timeout);
      if (!message.makeRewardedVisible()) unavailable();
    };
    const handleGrant = (message: googletag.events.RewardedSlotGrantedEvent) => {
      if (message.slot !== slot) return;
      ads.removeEventListener('rewardedSlotGranted', handleGrant);
      grant();
    };
    const handleClose = (message: googletag.events.RewardedSlotClosedEvent) => {
      if (message.slot !== slot) return;
      cleanup();
      resolve();
    };
    const handleNoFill = (message: googletag.events.SlotRenderEndedEvent) => {
      if (message.slot === slot && message.isEmpty) unavailable();
    };
    const timeout = setTimeout(unavailable, 10_000);
    signal.addEventListener('abort', handleAbort, { once: true });
    ads.addEventListener('rewardedSlotReady', handleReady);
    ads.addEventListener('rewardedSlotGranted', handleGrant);
    ads.addEventListener('rewardedSlotClosed', handleClose);
    ads.addEventListener('slotRenderEnded', handleNoFill);
    try {
      googletag.enableServices();
      googletag.display(slot);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
