import { ZodError } from "zod";


export const handleError = (error: unknown) => {
	if (error instanceof ZodError) {
		return {
      response: {
        success: false,
        message: "Validation failed",
        issues: error.issues,
      },
      code: 400
    };
	}
	if (error instanceof Error) {
		return {
      response: {
        success: false,
        message: error.message,
      },
      code: 500
    };
	}
	return {
    response: {
      success: false,
      message: "Unknown error",
    },
    code: 500
  };
};