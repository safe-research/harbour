import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorItem, FormItem, SubmitItem } from "@/components/Forms";
import { SECRET_HARBOUR_ADDRESS } from "@/lib/harbour";
import { ethereumAddressSchema } from "@/lib/validators";

const STORAGE_KEY_SETTINGS = "localStorage.settings.object.v1";

async function loadCurrentSettings(): Promise<Partial<SettingsFormData>> {
	const settingsFormSchema = createSettingsFormSchema();
	try {
		const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
		return stored ? settingsFormSchema.parse(JSON.parse(stored)) : {};
	} catch (e) {
		console.error(e);
		return {};
	}
}

function useCurrentSettings(): [
	Partial<SettingsFormData> | undefined,
	() => void,
] {
	const [currentSettings, setCurrentSettings] = useState<
		Partial<SettingsFormData> | undefined
	>();
	const loadSettings = useCallback(async () => {
		setCurrentSettings(await loadCurrentSettings());
	}, []);
	useEffect(() => {
		loadSettings();
	}, [loadSettings]);
	return [
		currentSettings,
		() => {
			loadSettings();
		},
	];
}

const createSettingsFormSchema = () =>
	z.object({
		harbourAddress: z.union([ethereumAddressSchema, z.literal("")]),
		quotaManagerAddress: z.union([
			ethereumAddressSchema,
			z.literal("").optional(),
		]),
		rpcUrl: z.union([z.string().url(), z.literal("")]),
		bundlerUrl: z.union([z.string().url(), z.literal("")]),
		validatorUrl: z.union([z.string().url(), z.literal("")]),
	});

export type SettingsFormData = z.infer<
	ReturnType<typeof createSettingsFormSchema>
>;

function SettingsForm({
	currentSettings,
	onSubmitted,
}: {
	currentSettings: Partial<SettingsFormData>;
	onSubmitted?: () => void;
}) {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string>();
	const {
		register,
		handleSubmit,
		reset,
		setValue,
		formState: { errors, isDirty },
	} = useForm<SettingsFormData>({
		resolver: zodResolver(createSettingsFormSchema()),
		defaultValues: currentSettings,
	});

	const onSubmit = async (data: SettingsFormData) => {
		setError(undefined);

		try {
			setIsSubmitting(true);
			localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(data));
			reset(data);
			onSubmitted?.();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "An error occured";
			setError(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	const onUseEncryption = () => {
		setValue("harbourAddress", SECRET_HARBOUR_ADDRESS, {
			shouldDirty: true,
		});
	};

	return (
		<form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
			<FormItem
				id="rpcUrl"
				register={register}
				error={errors.rpcUrl}
				label="RPC Url (for Harbour)"
			/>
			<div className="flex items-end">
				<div className="grow">
					<FormItem
						id="harbourAddress"
						register={register}
						error={errors.harbourAddress}
						label="Harbour Address"
						placeholder="0x…"
					/>
				</div>
				<div className="flex-none">
					<button
						type="button"
						className="px-3 py-2 ml-4 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
						onClick={onUseEncryption}
						aria-label="use encryption"
					>
						{"🔐"}
					</button>
				</div>
			</div>
			<FormItem
				id="quotaManagerAddress"
				register={register}
				error={errors.quotaManagerAddress}
				label="Quota Manager Address"
				placeholder="0x…"
			/>
			<FormItem
				id="bundlerUrl"
				register={register}
				error={errors.bundlerUrl}
				label="Bundler Url"
			/>
			<FormItem
				id="validatorUrl"
				register={register}
				error={errors.validatorUrl}
				label="Validator Url"
			/>

			<SubmitItem
				actionTitle="Save"
				isSubmitting={isSubmitting}
				disabled={!isDirty}
			/>

			<ErrorItem error={error} />
		</form>
	);
}

export { SettingsForm, useCurrentSettings, loadCurrentSettings };
