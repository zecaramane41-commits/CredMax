import express from "express";
import { query, withTransaction } from "../config/db.js";
import { requireAuth, resolveCompanyScope } from "../middleware/auth.js";
import { requireLoanPermission, requireReadWrite } from "../middleware/permissions.js";
import { postDoubleEntry } from "../services/accounting-service.js";
import { notifyCaixaMovement, notifyPaymentReceivedSms, notifyDisbursementEmail, notifyRepaymentEmail, createSystemNotification } from "../services/notification-service.js";
import { publishAppEvent } from "../services/event-bus.js";
import { getLoan360 } from "../services/loan-360-service.js";

export const loanRouter = express.Router();

loanRouter.use(requireAuth);
loanRouter.use(requireLoanPermission);