import { body, validationResult } from "express-validator";

export const signupValidation = [
  body("full_name").trim().isLength({ min: 2, max: 120 }),
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 }),
];

export const loginValidation = [
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 }),
];

export const otpValidation = [
  body("email").isEmail().normalizeEmail(),
  body("code").isLength({ min: 6, max: 6 }).isNumeric(),
];

export const resetValidation = [
  body("email").isEmail().normalizeEmail(),
];

export function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: result.array(),
    });
  }
  next();
}