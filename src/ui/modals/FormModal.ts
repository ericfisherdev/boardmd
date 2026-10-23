import { App, ButtonComponent, Modal } from 'obsidian';
import { reportError } from '../reportError';

/**
 * Modal with a form body and a submit button. Stays open and reports the error when
 * submission fails, so the user can correct their input.
 */
export abstract class FormModal extends Modal {
	private submitting = false;
	private submitEnabled = true;
	private submitButton: ButtonComponent | null = null;

	protected constructor(
		app: App,
		private readonly title: string,
		private readonly submitLabel: string,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText(this.title);
		this.contentEl.empty();
		this.modalEl.addClass('boardmd-form-modal');
		this.contentEl.addClass('boardmd-form');
		this.renderFields(this.contentEl);
		// The button sits below the scrolling form, so it stays in view however tall the form is.
		const footer = this.modalEl.createDiv({ cls: 'modal-button-container boardmd-form-footer' });
		this.submitButton = new ButtonComponent(footer)
			.setButtonText(this.submitLabel)
			.setCta()
			.setDisabled(!this.submitEnabled)
			.onClick(() => void this.submit());
	}

	/** Greys out the submit button (and ignores Enter) while the form cannot be submitted. */
	protected setSubmitEnabled(enabled: boolean): void {
		this.submitEnabled = enabled;
		this.submitButton?.setDisabled(!enabled);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	protected abstract renderFields(container: HTMLElement): void;

	/** Performs the action; throw to keep the modal open. */
	protected abstract onSubmit(): Promise<void>;

	/** Submits when Enter is pressed in a single-line input. */
	protected submitOnEnter(input: HTMLInputElement): void {
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.isComposing) {
				event.preventDefault();
				void this.submit();
			}
		});
	}

	private async submit(): Promise<void> {
		if (this.submitting || !this.submitEnabled) return;
		this.submitting = true;
		try {
			await this.onSubmit();
			this.close();
		} catch (error) {
			reportError(error);
		} finally {
			this.submitting = false;
		}
	}
}
