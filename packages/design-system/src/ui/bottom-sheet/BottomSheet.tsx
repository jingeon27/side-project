'use client';

import {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { Drawer } from '@base-ui/react/drawer';
import { XIcon } from 'lucide-react';

import { cn } from '../../lib/cn.helper';
import { dialogStyles } from '../dialog/dialog.styles';
import { IconButton } from '../icon-button/IconButton';

export type TBottomSheetSnapPoint = Drawer.Root.SnapPoint;

const defaultSnapPoints: TBottomSheetSnapPoint[] = [0.6, 1];
// ARIA slider 관례: 위·오른쪽·PageUp은 키우고 아래·왼쪽·PageDown은 줄인다. Home·End는 최소·최대다.
const expandKeys = ['ArrowUp', 'ArrowRight', 'PageUp'];
const compactKeys = ['ArrowDown', 'ArrowLeft', 'PageDown'];

interface IBottomSheetContext {
  snapPoints: readonly TBottomSheetSnapPoint[];
  snapIndex: number;
  resizable: boolean;
  dismissible: boolean;
  snapTo: (index: number) => void;
}

const BottomSheetContext = createContext<IBottomSheetContext | null>(null);

function useBottomSheet(part: string) {
  const sheet = useContext(BottomSheetContext);
  if (!sheet) throw new Error(`BottomSheet.${part}는 BottomSheet.Root 안에서 쓴다.`);
  return sheet;
}

export interface IBottomSheetRootProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 닫힘 전환이 끝난 뒤 false로 부른다. overlay를 unmount하거나 history를 정리하는 곳이다. */
  onOpenChangeComplete?: (open: boolean) => void;
  /** Handle → Header → Content → Footer 순서로 넣는다. */
  children: ReactNode;
  /**
   * 화면 높이 비율(0~1) 또는 px. 작은 값부터 적고 첫 값으로 연다. 생략하면 내용 높이로 열린다.
   * 둘 이상이면 BottomSheet.Handle로 높이를 바꾼다.
   */
  snapPoints?: TBottomSheetSnapPoint[];
  /** 높이를 제어할 때 쓴다. 생략하면 시트가 상태를 갖고 닫힌 뒤 첫 값으로 돌아간다. */
  snapPoint?: TBottomSheetSnapPoint;
  onSnapPointChange?: (snapPoint: TBottomSheetSnapPoint) => void;
  /** false면 닫기 버튼·Esc·바깥 클릭·아래로 밀기를 막는다. 앱이 완료 동작으로 open을 바꾼다. */
  dismissible?: boolean;
  /** 768px부터 같은 팝업을 중앙 모달로 보여 준다. */
  responsive?: boolean;
  container?: ComponentProps<typeof Drawer.Portal>['container'];
  className?: string;
}

/** Base UI Drawer 시트. 포커스 격리·복귀와 소프트 키보드(VirtualKeyboardProvider)를 맡는다. */
function BottomSheetRoot({
  open,
  onOpenChange,
  onOpenChangeComplete,
  children,
  snapPoints,
  snapPoint,
  onSnapPointChange,
  dismissible = true,
  responsive = false,
  container,
  className,
}: IBottomSheetRootProps) {
  const points = snapPoints ?? [];
  const [ownSnapPoint, setOwnSnapPoint] = useState<TBottomSheetSnapPoint | undefined>(points[0]);
  // snapPoints가 바뀌어 이전 값이 없으면 첫 값으로 돌아간다.
  const requestedSnapPoint = snapPoint ?? ownSnapPoint;
  const snapIndex = Math.max(0, requestedSnapPoint === undefined ? 0 : points.indexOf(requestedSnapPoint));
  const currentSnapPoint = points[snapIndex];
  const resizable = points.length > 1;
  const changeSnapPoint = (nextSnapPoint: TBottomSheetSnapPoint) => {
    setOwnSnapPoint(nextSnapPoint);
    onSnapPointChange?.(nextSnapPoint);
  };
  const sheet: IBottomSheetContext = {
    snapPoints: points,
    snapIndex,
    resizable,
    dismissible,
    snapTo: (index) => changeSnapPoint(points[Math.min(points.length - 1, Math.max(0, index))]!),
  };

  return (
    <Drawer.Root
      open={open}
      snapPoints={snapPoints?.length ? snapPoints : undefined}
      snapPoint={points.length ? currentSnapPoint : undefined}
      onSnapPointChange={(nextSnapPoint) => {
        if (nextSnapPoint !== null) changeSnapPoint(nextSnapPoint);
      }}
      snapToSequentialPoints={resizable}
      disablePointerDismissal={!dismissible}
      onOpenChange={(nextOpen, details) => {
        if (!nextOpen && !dismissible) {
          details.cancel();
          return;
        }
        onOpenChange(nextOpen);
      }}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) setOwnSnapPoint(points[0]);
        onOpenChangeComplete?.(nextOpen);
      }}
    >
      <Drawer.VirtualKeyboardProvider>
        <Drawer.Portal container={container}>
          <Drawer.Backdrop className={dialogStyles.backdrop} />
          <Drawer.Viewport className="ds-sheet-viewport" data-responsive={responsive || undefined}>
            <Drawer.Popup
              className={cn('ds-sheet-popup', className)}
              data-slot="bottom-sheet-content"
              data-responsive={responsive || undefined}
              data-fit-content={points.length ? undefined : true}
            >
              <BottomSheetContext.Provider value={sheet}>
                <div className="ds-sheet-frame">
                  {/* 고정 높이 시트는 장식용 손잡이만 그린다. 높이를 바꾸는 시트는 Handle이 손잡이가 된다. */}
                  {resizable ? null : (
                    <div className="ds-sheet-handle" data-decorative="" aria-hidden="true">
                      <span className="ds-sheet-grip" />
                    </div>
                  )}
                  {children}
                </div>
              </BottomSheetContext.Provider>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.VirtualKeyboardProvider>
    </Drawer.Root>
  );
}

/** Base UI 규칙: 0~1은 화면 높이 비율, 1보다 큰 수는 px, 문자열은 CSS 길이다. */
function percentOf(point: TBottomSheetSnapPoint) {
  return typeof point === 'number' && point <= 1 ? Math.round(point * 100) : null;
}

function snapPointText(point: TBottomSheetSnapPoint) {
  const percent = percentOf(point);
  if (percent !== null) return `${percent}%`;
  return typeof point === 'number' ? `${point}px` : point;
}

/**
 * 모두 비율이면 높이 %를, px가 섞이면 단계(1~n)를 값으로 쓴다.
 * 범위가 60~100처럼 0에서 시작하지 않으면 값만으로는 스크린 리더가 비율을 잘못 읽으므로 글자도 준다.
 */
function sliderValues(points: readonly TBottomSheetSnapPoint[], index: number) {
  const percents = points.map(percentOf);
  const text = snapPointText(points[index]!);
  if (percents.every((percent) => percent !== null)) {
    return { min: Math.min(...percents), max: Math.max(...percents), now: percents[index]!, text };
  }
  return { min: 1, max: points.length, now: index + 1, text };
}

export interface IBottomSheetHandleProps {
  /** 높이 조절 손잡이의 이름. 번역은 소비 앱이 맡는다. */
  label: string;
  className?: string;
}

/**
 * snapPoints가 둘 이상일 때 높이를 바꾸는 손잡이(role="slider"). 끌기·클릭과
 * 방향키·PageUp·PageDown·Home·End·Enter·Space를 지원한다. 고정 높이 시트에서는 그리지 않는다.
 */
function BottomSheetHandle({ label, className }: IBottomSheetHandleProps) {
  const { snapPoints, snapIndex, resizable, snapTo } = useBottomSheet('Handle');
  if (!resizable) return null;
  const value = sliderValues(snapPoints, snapIndex);
  const last = snapPoints.length - 1;
  const handleCycle = () => snapTo(snapIndex === last ? 0 : snapIndex + 1);
  const keyTargets: Record<string, number> = { Home: 0, End: last };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ([' ', 'Enter'].includes(event.key)) {
      event.preventDefault();
      handleCycle();
      return;
    }
    const target = expandKeys.includes(event.key)
      ? snapIndex + 1
      : compactKeys.includes(event.key)
        ? snapIndex - 1
        : keyTargets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    snapTo(target);
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      className={cn('ds-sheet-handle', className)}
      data-slot="bottom-sheet-handle"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={value.min}
      aria-valuemax={value.max}
      aria-valuenow={value.now}
      aria-valuetext={value.text}
      onClick={handleCycle}
      onKeyDown={handleKeyDown}
    >
      <span className="ds-sheet-grip" aria-hidden="true" />
    </div>
  );
}

export interface IBottomSheetHeaderProps {
  /** 시트의 이름. 스크린 리더가 대화상자 이름으로 읽는다. */
  title: ReactNode;
  description?: ReactNode;
  /** 제목 옆 동작(BottomSheet.Close 등) */
  children?: ReactNode;
  className?: string;
}

/** 스크롤되지 않는 제목 영역. */
function BottomSheetHeader({ title, description, children, className }: IBottomSheetHeaderProps) {
  return (
    <div className={cn('ds-sheet-header', className)} data-slot="bottom-sheet-header">
      <div className="ds-sheet-heading">
        <Drawer.Title className={dialogStyles.title}>{title}</Drawer.Title>
        {description ? (
          <Drawer.Description className={dialogStyles.description}>{description}</Drawer.Description>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export interface IBottomSheetCloseProps {
  /** 닫기 버튼 이름. 번역은 소비 앱이 맡는다. */
  label: string;
  className?: string;
}

/** 제목 옆 X 버튼. dismissible={false}인 시트에서는 그리지 않는다. */
function BottomSheetClose({ label, className }: IBottomSheetCloseProps) {
  const { dismissible } = useBottomSheet('Close');
  if (!dismissible) return null;
  return (
    <Drawer.Close render={<IconButton label={label} className={cn('-mt-2.5 -mr-3', className)} />}>
      <XIcon aria-hidden="true" />
    </Drawer.Close>
  );
}

/** 시트에서 이 부분만 스크롤된다. 기본 여백은 className으로 바꾼다. */
function BottomSheetContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Drawer.Content className={cn('ds-sheet-body', className)} data-slot="bottom-sheet-body">
      {children}
    </Drawer.Content>
  );
}

/**
 * 본문 밖 하단에 고정되는 작업 영역. 버튼은 가로로 같은 너비를 나눈다.
 * 본문 폼에 id를 주고 제출 버튼의 form에 연결하면 기본 폼 검증·Enter 제출이 유지된다.
 */
function BottomSheetFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('ds-sheet-footer', className)} data-slot="bottom-sheet-footer">
      {children}
    </div>
  );
}

export interface IBottomSheetProps extends Omit<IBottomSheetRootProps, 'children'> {
  /** 글자 제목. 아이콘·개수처럼 꾸민 제목은 조합 API의 Header가 받는다. */
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  showCloseButton?: boolean;
  /** 닫기 버튼 이름. 번역은 소비 앱이 맡고 패키지는 기본값을 두지 않는다. */
  closeLabel: string;
  /** 높이 조절 손잡이 이름. 번역은 소비 앱이 맡는다. */
  resizeLabel: string;
}

/**
 * 제목·본문·하단 작업을 한 번에 받는 입력 시트. 기본은 화면의 60%와 전체 높이 사이를 오간다.
 * 배치를 바꾸거나 슬롯을 더하려면 BottomSheet.Root·Handle·Header·Close·Content·Footer를 조합한다.
 */
export function BottomSheet({
  title,
  description,
  children,
  footer,
  showCloseButton = true,
  closeLabel,
  resizeLabel,
  snapPoints = defaultSnapPoints,
  ...rootProps
}: IBottomSheetProps) {
  return (
    <BottomSheetRoot {...rootProps} snapPoints={snapPoints}>
      <BottomSheetHandle label={resizeLabel} />
      <BottomSheetHeader title={title} description={description}>
        {showCloseButton ? <BottomSheetClose label={closeLabel} /> : null}
      </BottomSheetHeader>
      <BottomSheetContent>{children}</BottomSheetContent>
      {footer ? <BottomSheetFooter>{footer}</BottomSheetFooter> : null}
    </BottomSheetRoot>
  );
}

BottomSheet.Root = BottomSheetRoot;
BottomSheet.Handle = BottomSheetHandle;
BottomSheet.Header = BottomSheetHeader;
BottomSheet.Close = BottomSheetClose;
BottomSheet.Content = BottomSheetContent;
BottomSheet.Footer = BottomSheetFooter;
