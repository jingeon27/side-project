import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/Button';
import { TextField } from '../text-field/TextField';
import { FormActions } from './FormActions';

const meta = {
  title: 'Forms/FormActions',
  component: FormActions,
} satisfies Meta<typeof FormActions>;
export default meta;
type TStory = StoryObj<typeof meta>;

export const Default: TStory = {
  render: () => (
    <div className="flex h-96 w-full max-w-app flex-col border border-line">
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <TextField label="이름" defaultValue="밤별" />
      </div>
      <FormActions>
        <div className="flex gap-3 [&>*]:flex-1">
          <Button variant="secondary" size="lg">
            취소
          </Button>
          <Button size="lg">저장</Button>
        </div>
      </FormActions>
    </div>
  ),
};
