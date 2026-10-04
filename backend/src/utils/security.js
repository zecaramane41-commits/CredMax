import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signToken(payload, expiresIn = "12h") {
  return jwt.sign(payload, env.jwtSecret, { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

export async function hashPassword(value) {
  return bcrypt.hash(value, 10);
}

export async function comparePassword(value, hash) {
  return bcrypt.compare(value, hash);
}
