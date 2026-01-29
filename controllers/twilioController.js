const mongoose = require("mongoose");
const twilio = require("twilio");
const AdminConfig = require("../models/AdminConfig");
const Call = require("../models/Call");
const AgentExtension = require("../models/AgentExtension");
const MCA = require("../models/MCA");
const UserResponse = require("../models/UserResponse");
const {
  getTwilioConfig,
  createTwilioClient,
  getBaseUrl,
  attachBusinessContext,
  upsertCallRecord,
  buildTwiMLUrl,
} = require("../utils/twilioHelpers");
const TwilioAccount = require("../models/TwilioAccount");
const {
  normalizePhoneNumber,
  isValidPhoneNumber,
  isValidExtension,
} = require("../middleware/twilioValidation");
const { processCallRecording, downloadTwilioRecording } = require("../services/openaiService");

/**
 * ============================================================================
 * TWILIO WEBHOOK HANDLERS (Public endpoints called by Twilio)
 * ============================================================================
 */

/**
 * Handle inbound call webhook
 * POST /api/twilio/voice/inbound
 * Called by Twilio when someone calls your business number
 */
exports.handleInboundCall = async (req, res) => {
  try {
    const twilioConfig = await getTwilioConfig();
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    // Extract required fields from Twilio webhook
    const fromNumber = req.body?.From;
    const toNumber = req.body?.To;
    const callSid = req.body?.CallSid;
    const callStatus = req.body?.CallStatus || "ringing";

    // Validate required fields
    if (!callSid || !fromNumber || !toNumber) {
      console.error("Missing required Twilio webhook fields", {
        callSid: !!callSid,
        fromNumber: !!fromNumber,
        toNumber: !!toNumber,
      });
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "We're sorry, there was an error processing your call. Please try again later."
      );
      twiml.hangup();
      return res.type("text/xml").status(200).send(twiml.toString());
    }

    // Normalize phone numbers
    const normalizedFrom = normalizePhoneNumber(fromNumber);
    const normalizedTo = normalizePhoneNumber(toNumber);

    if (!normalizedFrom || !normalizedTo) {
      console.error("Invalid phone number format", { fromNumber, toNumber });
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "We're sorry, there was an error processing your call."
      );
      twiml.hangup();
      return res.type("text/xml").status(200).send(twiml.toString());
    }

    // Create or update Call record
    try {
      const callData = {
        twilioCallSid: callSid,
        direction: "inbound",
        fromNumber: normalizedFrom,
        toNumber: normalizedTo,
        status: callStatus,
        metadata: {
          originalFrom: fromNumber,
          originalTo: toNumber,
          initialWebhook: {
            CallSid: callSid,
            From: fromNumber,
            To: toNumber,
            CallStatus: callStatus,
            Timestamp: req.body?.Timestamp,
          },
        },
      };

      let callDoc = await Call.findOne({ twilioCallSid: callSid });
      if (!callDoc) {
        callDoc = new Call(callData);
        await attachBusinessContext(callDoc);
        await callDoc.save();
      } else {
        callDoc.status = callStatus;
        await callDoc.save();
      }
    } catch (dbError) {
      // Log but don't fail the call if DB save fails
      console.error("Error saving call record:", dbError);
    }

    // Check recording preferences
    const shouldRecord =
      twilioConfig.recordings?.enabled &&
      twilioConfig.recordings?.recordInbound === true;

    // Build callback URLs (must be absolute URLs for Twilio)
    const baseUrl = getBaseUrl(req);
    const extensionActionUrl = buildTwiMLUrl(baseUrl, "/ivr/extension");

    // IVR: Gather extension input
    const gather = twiml.gather({
      numDigits: 3,
      action: extensionActionUrl,
      method: "POST",
      timeout: 10,
      finishOnKey: "#",
    });

    gather.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "Thank you for calling. Please enter the 3 digit extension of the person you wish to reach, or press pound to skip."
    );

    // Fallback: If no input received
    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "We did not receive your extension. Please call back and try again."
    );
    twiml.hangup();

    res.type("text/xml");
    res.status(200).send(twiml.toString());
  } catch (error) {
    console.error("Inbound call webhook error:", error);
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const errorTwiml = new VoiceResponse();
    errorTwiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "We're sorry, we're experiencing technical difficulties. Please try again later."
    );
    errorTwiml.hangup();
    res.type("text/xml").status(200).send(errorTwiml.toString());
  }
};

/**
 * Handle IVR extension selection
 * POST /api/twilio/ivr/extension
 * Called by Twilio after caller enters extension digits
 */
exports.handleExtensionSelection = async (req, res) => {
  try {
    const twilioConfig = await getTwilioConfig();
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    const digits = req.body?.Digits?.trim();
    const callSid = req.body?.CallSid;

    // Validate inputs
    if (!callSid) {
      console.error("Missing CallSid in extension selection webhook");
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "We're sorry, there was an error processing your call."
      );
      twiml.hangup();
      return res.type("text/xml").status(200).send(twiml.toString());
    }

    if (!digits || !isValidExtension(digits)) {
      console.warn("Invalid extension entered", { digits, callSid });
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "Invalid extension. Please call back and try again."
      );
      twiml.hangup();
      return res.type("text/xml").status(200).send(twiml.toString());
    }

    // Find active extension
    const extension = await AgentExtension.findOne({
      extension: digits,
      isActive: true,
    }).populate("userId");

    if (!extension) {
      console.warn("Extension not found or inactive", { digits, callSid });
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "The extension you entered is not available. Please call back and try again."
      );
      twiml.hangup();
      return res.type("text/xml").status(200).send(twiml.toString());
    }

    if (!extension.forwardingNumber) {
      console.warn("Extension has no forwarding number", {
        extension: digits,
        callSid,
      });
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "This extension is not configured. Please call back and try a different extension."
      );
      twiml.hangup();
      return res.type("text/xml").status(200).send(twiml.toString());
    }

    // Normalize forwarding number
    const forwardingNumber = normalizePhoneNumber(extension.forwardingNumber);
    if (!forwardingNumber || !isValidPhoneNumber(forwardingNumber)) {
      console.error("Invalid forwarding number for extension", {
        extension: digits,
        forwardingNumber: extension.forwardingNumber,
      });
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "This extension is not properly configured. Please contact support."
      );
      twiml.hangup();
      return res.type("text/xml").status(200).send(twiml.toString());
    }

    // Update call record with agent info
    try {
      await Call.updateOne(
        { twilioCallSid: callSid },
        {
          $set: {
            agentExtension: extension.extension,
            agentId: extension.userId?._id || null,
          },
        }
      );
    } catch (dbError) {
      console.error("Error updating call with agent info:", dbError);
      // Continue even if DB update fails
    }

    // Check recording preferences
    const shouldRecord =
      twilioConfig.recordings?.enabled &&
      twilioConfig.recordings?.recordInbound === true;

    // Build callback URLs (must be absolute URLs for Twilio)
    const baseUrl = getBaseUrl(req);
    const recordingCallbackUrl = shouldRecord
      ? buildTwiMLUrl(baseUrl, "/recording-status")
      : undefined;
    const statusCallbackUrl = buildTwiMLUrl(baseUrl, "/call-status");
    const voicemailUrl = buildTwiMLUrl(baseUrl, "/voicemail-greeting");

    // Dial the forwarding number - route to voicemail if no answer
    const dial = twiml.dial({
      callerId: twilioConfig.primaryNumber || undefined,
      timeout: 25, // Ring for 25 seconds before voicemail
      record: shouldRecord ? "record-from-answer-dual" : "do-not-record",
      recordingStatusCallback: shouldRecord ? recordingCallbackUrl : undefined,
      recordingStatusCallbackMethod: shouldRecord ? "POST" : undefined,
      action: voicemailUrl, // Route to voicemail if call not answered
      method: "POST",
    });

    dial.number(
      {
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST",
      },
      forwardingNumber
    );

    res.type("text/xml");
    res.status(200).send(twiml.toString());
  } catch (error) {
    console.error("Extension selection webhook error:", error);
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const errorTwiml = new VoiceResponse();
    errorTwiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "We're sorry, we're experiencing technical difficulties. Please try again later."
    );
    errorTwiml.hangup();
    res.type("text/xml").status(200).send(errorTwiml.toString());
  }
};

/**
 * Handle call status updates
 * POST /api/twilio/call-status
 * Called by Twilio for status updates on all calls
 *
 * IMPORTANT: For web dialer outbound calls, there are TWO call legs:
 * 1. Parent call (browser <-> Twilio) - Direction: "outbound-api", From: "client:identity"
 * 2. Child call (Twilio <-> customer) - Direction: "outbound-dial", has ParentCallSid
 *
 * We track the PARENT call (created in outboundBridge) and update it with child call info.
 * Child calls have ParentCallSid set and should NOT create separate records.
 */
exports.handleCallStatus = async (req, res) => {
  try {
    const callSid = req.body?.CallSid;
    if (!callSid) {
      console.warn("Call status webhook missing CallSid");
      return res.status(200).send("OK");
    }

    const callStatus = req.body?.CallStatus;
    const fromNumber = req.body?.From;
    const toNumber = req.body?.To;
    const direction = req.body?.Direction;
    const parentCallSid = req.body?.ParentCallSid;
    const timestamp = req.body?.Timestamp;
    const duration = req.body?.Duration;

    console.log(`Call status webhook: CallSid=${callSid}, Status=${callStatus}, ParentCallSid=${parentCallSid || 'none'}, Direction=${direction}, From=${fromNumber}`);

    // CRITICAL: If this call has a ParentCallSid, it's a child call leg (e.g., the customer leg).
    // We should update the PARENT call record instead of creating a new one.
    // This prevents duplicate "inbound" and "outbound" records for the same call.
    if (parentCallSid) {
      // This is a child call - update the parent call record with child status info
      const parentCall = await Call.findOne({ twilioCallSid: parentCallSid });

      if (parentCall) {
        // Update parent call with child call status (the customer leg status is more meaningful)
        const terminalStatuses = ["completed", "busy", "failed", "no-answer", "canceled"];

        // Always update status if child call has answered or terminal status
        if (callStatus?.toLowerCase() === "answered" || callStatus?.toLowerCase() === "in-progress") {
          parentCall.status = "in-progress";
          await parentCall.save();
          console.log(`Updated parent call ${parentCallSid} to in-progress (child answered)`);
        } else if (terminalStatuses.includes(callStatus?.toLowerCase())) {
          parentCall.status = callStatus;
          parentCall.endTime = new Date();

          // Update duration from child call (actual talk time with customer)
          if (duration && !isNaN(Number(duration)) && Number(duration) >= 0) {
            parentCall.durationSeconds = Math.floor(Number(duration));
          }

          // Store child call metadata
          parentCall.metadata = parentCall.metadata || {};
          parentCall.metadata.childCallStatus = {
            childCallSid: callSid,
            status: callStatus,
            duration: duration,
            timestamp: timestamp,
          };

          await parentCall.save();
          console.log(`Updated parent call ${parentCallSid} with child terminal status: ${callStatus}`);

          // Trigger transcription if recording available
          if (
            parentCall.recordingUrl &&
            parentCall.transcription?.status !== "completed" &&
            parentCall.transcription?.status !== "processing"
          ) {
            processCallRecording(parentCall).catch((error) => {
              console.error("Background transcription/summary processing error:", error);
            });
          }
        }
      } else {
        console.log(`Parent call ${parentCallSid} not found for child ${callSid}, skipping`);
      }

      // Don't create a separate record for child calls
      return res.status(200).send("OK");
    }

    // Check if this is a Voice SDK parent call (browser leg)
    // These have From starting with "client:" and Direction "outbound-api"
    const isVoiceSdkParentCall = fromNumber?.startsWith("client:") ||
                                  direction?.toLowerCase() === "outbound-api";

    // For Voice SDK parent calls, only update the existing record created by outboundBridge
    // Don't create new records from parent call status callbacks
    if (isVoiceSdkParentCall) {
      const existingCall = await Call.findOne({ twilioCallSid: callSid });

      if (existingCall) {
        // Update the existing record (created by outboundBridge)
        const terminalStatuses = ["completed", "busy", "failed", "no-answer", "canceled"];

        // Only update if the status is meaningful (not just "initiated" or "ringing")
        // The child call status is more important for final status
        if (terminalStatuses.includes(callStatus?.toLowerCase())) {
          // Only update if not already updated by child call
          if (!existingCall.metadata?.childCallStatus) {
            existingCall.status = callStatus;
            existingCall.endTime = new Date();
            if (duration && !isNaN(Number(duration))) {
              existingCall.durationSeconds = Math.floor(Number(duration));
            }
          }
          existingCall.metadata = existingCall.metadata || {};
          existingCall.metadata.parentCallFinalStatus = {
            status: callStatus,
            duration: duration,
            timestamp: timestamp,
          };
          await existingCall.save();
          console.log(`Updated Voice SDK parent call ${callSid} with status: ${callStatus}`);
        }
      } else {
        // Voice SDK parent call without a record - this shouldn't happen normally
        // as outboundBridge should have created it. Skip to avoid duplicates.
        console.log(`Voice SDK parent call ${callSid} has no record, skipping (should be created by outboundBridge)`);
      }

      return res.status(200).send("OK");
    }

    // This is a regular call (inbound or direct outbound API call) - process normally
    const normalizedFrom = fromNumber ? normalizePhoneNumber(fromNumber) : null;
    const normalizedTo = toNumber ? normalizePhoneNumber(toNumber) : null;

    // Determine direction based on Twilio's Direction field
    let callDirection = "outbound";
    if (direction) {
      if (direction.toLowerCase().includes("inbound")) {
        callDirection = "inbound";
      }
    }

    // Prepare update data
    const updateData = {
      status: callStatus,
    };

    // Store webhook metadata (don't overwrite existing metadata)
    // We'll merge it later

    if (duration && !isNaN(Number(duration)) && Number(duration) >= 0) {
      updateData.durationSeconds = Math.floor(Number(duration));
    }

    // Set end time for terminal statuses
    const terminalStatuses = [
      "completed",
      "busy",
      "failed",
      "no-answer",
      "canceled",
    ];
    if (terminalStatuses.includes(callStatus?.toLowerCase())) {
      updateData.endTime = new Date();
    }

    // Find existing call record
    let callDoc = await Call.findOne({ twilioCallSid: callSid });

    if (callDoc) {
      // Update existing call
      callDoc.status = updateData.status;
      if (updateData.durationSeconds !== undefined) {
        callDoc.durationSeconds = updateData.durationSeconds;
      }
      if (updateData.endTime) {
        callDoc.endTime = updateData.endTime;
      }

      // Update metadata
      callDoc.metadata = callDoc.metadata || {};
      callDoc.metadata.lastStatusWebhook = {
        CallSid: callSid,
        CallStatus: callStatus,
        From: fromNumber,
        To: toNumber,
        Direction: direction,
        Timestamp: timestamp,
        Duration: duration,
      };

      // Re-attach business context if call is completing
      if (terminalStatuses.includes(callStatus?.toLowerCase())) {
        await attachBusinessContext(callDoc);
      }

      await callDoc.save();
      console.log(`Updated call ${callSid} with status: ${callStatus}`);

      // If call is completed and recording is available, trigger transcription/summary
      if (
        terminalStatuses.includes(callStatus?.toLowerCase()) &&
        callDoc.recordingUrl &&
        callDoc.transcription?.status !== "completed" &&
        callDoc.transcription?.status !== "processing"
      ) {
        processCallRecording(callDoc).catch((error) => {
          console.error("Background transcription/summary processing error:", error);
        });
      }
    } else {
      // No existing record found for this CallSid
      // Only create new records for INBOUND calls (direction contains "inbound")
      // DO NOT create records for outbound-dial (child calls) - these should update parent
      const isInboundCall = direction?.toLowerCase().includes("inbound");
      const isOutboundDial = direction?.toLowerCase() === "outbound-dial";

      if (isOutboundDial) {
        // This is a child call (Twilio -> Customer) that somehow didn't have a parent
        // This can happen if the call was very short or there was a race condition
        // Log it but don't create a separate record to avoid duplicates
        console.log(`Skipping orphan child call ${callSid} (Direction: ${direction}) - no parent found`);
        return res.status(200).send("OK");
      }

      if (!isInboundCall) {
        // Not inbound, not outbound-dial - might be some other outbound call type
        // Skip to avoid creating duplicate records for web dialer calls
        console.log(`Skipping unknown call type ${callSid} (Direction: ${direction}) - not creating record`);
        return res.status(200).send("OK");
      }

      // This is an inbound call - create a new record
      console.log(`Creating new call record for inbound call ${callSid}`);

      const newCallData = {
        twilioCallSid: callSid,
        direction: "inbound",
        fromNumber: normalizedFrom || fromNumber || "unknown",
        toNumber: normalizedTo || toNumber || "unknown",
        status: callStatus,
        metadata: {
          lastStatusWebhook: {
            CallSid: callSid,
            CallStatus: callStatus,
            From: fromNumber,
            To: toNumber,
            Direction: direction,
            Timestamp: timestamp,
            Duration: duration,
          },
        },
      };

      if (updateData.durationSeconds !== undefined) {
        newCallData.durationSeconds = updateData.durationSeconds;
      }
      if (updateData.endTime) {
        newCallData.endTime = updateData.endTime;
      }

      callDoc = new Call(newCallData);
      await attachBusinessContext(callDoc);
      await callDoc.save();
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Call status webhook error:", error);
    // Always return 200 to Twilio to prevent retries for our errors
    res.status(200).send("OK");
  }
};

/**
 * Handle recording status updates
 * POST /api/twilio/recording-status
 * Called by Twilio when recording is ready
 *
 * IMPORTANT: For Voice SDK calls with <Dial record="record-from-answer-dual">,
 * the recording is associated with the PARENT call SID (the Voice SDK connection).
 * The RecordingDuration is the actual talk time and should update durationSeconds.
 */
exports.handleRecordingStatus = async (req, res) => {
  try {
    const callSid = req.body?.CallSid;
    const recordingSid = req.body?.RecordingSid;
    const recordingUrl = req.body?.RecordingUrl;
    const recordingDuration = req.body?.RecordingDuration;
    const recordingStatus = req.body?.RecordingStatus;

    console.log(`Recording status webhook: CallSid=${callSid}, Status=${recordingStatus}, Duration=${recordingDuration}s, URL=${recordingUrl ? 'present' : 'missing'}`);

    if (!callSid) {
      console.warn("Recording status webhook missing CallSid");
      return res.status(200).send("OK");
    }

    // Only process completed recordings
    if (recordingStatus !== "completed") {
      return res.status(200).send("OK");
    }

    if (!recordingUrl) {
      console.warn("Recording status webhook missing RecordingUrl", {
        callSid,
        recordingSid,
        recordingStatus,
      });
      return res.status(200).send("OK");
    }

    // Parse the recording duration - this is the actual call talk time
    const durationSecs = recordingDuration && !isNaN(Number(recordingDuration))
      ? Math.floor(Number(recordingDuration))
      : null;

    const updateData = {
      recordingSid: recordingSid || null,
      recordingUrl: recordingUrl,
    };

    // IMPORTANT: Recording duration IS the call duration for recorded calls
    // This is more accurate than the status callback duration
    if (durationSecs !== null && durationSecs >= 0) {
      updateData.recordingDurationSeconds = durationSecs;
      updateData.durationSeconds = durationSecs; // Also update main duration field
    }

    // Try to find the call record by CallSid first
    let callDoc = await Call.findOne({ twilioCallSid: callSid });

    // If not found, check if this callSid is stored as a child call in metadata
    if (!callDoc) {
      callDoc = await Call.findOne({ "metadata.childCallStatus.childCallSid": callSid });
      if (callDoc) {
        console.log(`Recording: found parent call ${callDoc.twilioCallSid} via child SID ${callSid}`);
      }
    }

    // Update the call record if found
    let updatedCall = null;
    if (callDoc) {
      // Update fields
      callDoc.recordingSid = updateData.recordingSid;
      callDoc.recordingUrl = updateData.recordingUrl;

      if (updateData.recordingDurationSeconds !== undefined) {
        callDoc.recordingDurationSeconds = updateData.recordingDurationSeconds;
      }

      // IMPORTANT: Update durationSeconds from recording if it's longer than current
      // Recording duration is the most accurate measure of actual talk time
      if (updateData.durationSeconds !== undefined) {
        if (!callDoc.durationSeconds || updateData.durationSeconds > callDoc.durationSeconds) {
          callDoc.durationSeconds = updateData.durationSeconds;
          console.log(`Updated call ${callDoc.twilioCallSid} duration to ${updateData.durationSeconds}s from recording`);
        }
      }

      // Merge metadata (don't overwrite existing metadata)
      callDoc.metadata = callDoc.metadata || {};
      callDoc.metadata.recordingStatusWebhook = {
        CallSid: callSid,
        RecordingSid: recordingSid,
        RecordingUrl: recordingUrl,
        RecordingDuration: recordingDuration,
        RecordingStatus: recordingStatus,
      };

      await callDoc.save();
      updatedCall = callDoc;
      console.log(`Recording attached to call ${callDoc.twilioCallSid}, duration: ${callDoc.durationSeconds}s`);
    } else {
      console.log(`Recording webhook: No call record found for CallSid ${callSid}`);
    }

    // If call record exists and recording is ready, trigger transcription/summary processing
    if (updatedCall) {
      // Check if call is completed and recording is available
      const isCallCompleted = ["completed", "busy", "failed", "no-answer", "canceled"].includes(
        updatedCall.status?.toLowerCase()
      );

      if (isCallCompleted && updatedCall.recordingUrl && updatedCall.recordingSid) {
        // Check if Twilio Intelligence is enabled - prefer it over OpenAI Whisper
        const adminConfig = await AdminConfig.findOne({ configId: "default" });
        const useTwilioIntelligence = adminConfig?.twilioIntelligence?.enabled &&
                                       adminConfig?.twilioIntelligence?.autoTranscribe &&
                                       adminConfig?.twilioIntelligence?.serviceSid;

        if (useTwilioIntelligence) {
          // Use Twilio Intelligence for transcription (no audio download needed!)
          const { processRecordingWithTwilioIntelligence } = require("../services/twilioIntelligenceService");
          processRecordingWithTwilioIntelligence(updatedCall).catch((error) => {
            console.error("Twilio Intelligence transcription error:", error);
            // Fall back to OpenAI if Twilio Intelligence fails
            processCallRecording(updatedCall).catch((fallbackError) => {
              console.error("Fallback OpenAI transcription error:", fallbackError);
            });
          });
          console.log(`Using Twilio Intelligence for transcription of call ${updatedCall.twilioCallSid}`);
        } else {
          // Fall back to OpenAI Whisper transcription
          processCallRecording(updatedCall).catch((error) => {
            console.error("Background transcription/summary processing error:", error);
          });
          console.log(`Using OpenAI Whisper for transcription of call ${updatedCall.twilioCallSid}`);
        }
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Recording status webhook error:", error);
    // Always return 200 to Twilio
    res.status(200).send("OK");
  }
};

/**
 * Handle outbound bridge TwiML
 * GET/POST /api/twilio/outbound-bridge
 * Called by Twilio to bridge agent to customer
 *
 * This is the TwiML endpoint called when a Voice SDK device.connect() is made.
 * It receives the CallSid of the parent call (browser <-> Twilio) and creates
 * a child call to the customer.
 *
 * IMPORTANT: To avoid duplicate call records:
 * - We create ONE call record here for the parent CallSid
 * - The child call (to customer) will send status callbacks with ParentCallSid
 * - handleCallStatus will update the parent record, not create a new one
 */
exports.outboundBridge = async (req, res) => {
  try {
    // Optional multi-account support via twilioAccountId param
    const twilioAccountId =
      req.query?.twilioAccountId ||
      req.query?.accountId ||
      req.body?.twilioAccountId ||
      req.body?.accountId;

    const twilioConfig = await getTwilioConfig(
      twilioAccountId ? { accountId: twilioAccountId } : undefined
    );
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    // Handle both query params (from direct calls) and body params (from Client SDK)
    const toNumber =
      req.query?.to || req.query?.To || req.body?.to || req.body?.To;

    // Optional explicit callerId / fromNumber override
    const explicitCallerId =
      req.query?.fromNumber ||
      req.query?.FromNumber ||
      req.body?.fromNumber ||
      req.body?.FromNumber ||
      null;

    const callSid = req.body?.CallSid || req.query?.CallSid;

    console.log(`Outbound bridge called: CallSid=${callSid}, To=${toNumber}`);

    if (!toNumber) {
      console.error("Outbound bridge missing destination number");
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "Missing destination number."
      );
      twiml.hangup();
      return res.type("text/xml").status(200).send(twiml.toString());
    }

    const normalizedTo = normalizePhoneNumber(toNumber);
    if (!normalizedTo || !isValidPhoneNumber(normalizedTo)) {
      console.error("Invalid destination number in outbound bridge", { toNumber });
      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        "Invalid destination number."
      );
      twiml.hangup();
      return res.type("text/xml").status(200).send(twiml.toString());
    }

    const shouldRecord =
      twilioConfig.recordings?.enabled &&
      twilioConfig.recordings?.recordOutbound === true;

    const baseUrl = getBaseUrl(req);
    const recordingCallbackUrl = buildTwiMLUrl(baseUrl, "/recording-status");
    const statusCallbackUrl = buildTwiMLUrl(baseUrl, "/call-status");

    const callerIdUsed =
      explicitCallerId ||
      twilioConfig.outboundCallerId ||
      twilioConfig.primaryNumber ||
      undefined;

    // Configure dial with status callback for the child call
    // The 'action' URL is called when the dial completes (used for post-dial logic)
    // We use statusCallback on the <Number> to get child call status updates
    const dial = twiml.dial({
      callerId: callerIdUsed,
      timeout: 30,
      // Recording on the dial captures both sides of the conversation
      record: shouldRecord ? "record-from-answer-dual" : "do-not-record",
      recordingStatusCallback: shouldRecord ? recordingCallbackUrl : undefined,
      recordingStatusCallbackMethod: shouldRecord ? "POST" : undefined,
      // Don't set 'action' - let the call end naturally
      // The parent call status callback will handle the final status
    });

    // The <Number> element creates a child call to the customer
    // The statusCallback here will include ParentCallSid, which we use to
    // update the parent call record instead of creating a duplicate
    dial.number(
      {
        statusCallback: statusCallbackUrl,
        statusCallbackEvent: ["answered", "completed"], // Only track meaningful events
        statusCallbackMethod: "POST",
      },
      normalizedTo
    );

    // Create initial call record immediately for the PARENT call
    // This is the main call record that will be displayed in the dashboard
    if (callSid) {
      try {
        let callDoc = await Call.findOne({ twilioCallSid: callSid });
        if (!callDoc) {
          callDoc = new Call({
            twilioCallSid: callSid,
            direction: "outbound",
            fromNumber: callerIdUsed || "unknown",
            toNumber: normalizedTo,
            status: "ringing", // Call is now ringing the customer
            startTime: new Date(),
            metadata: {
              source: "web-dialer",
              dialerType: "voice-sdk",
              customerNumber: normalizedTo,
            },
          });
          // Try to attach business context based on the destination number
          await attachBusinessContext(callDoc);
          await callDoc.save();
          console.log(`Created call record for ${callSid} -> ${normalizedTo}`);
        } else {
          // Update existing record if it was created by a previous webhook
          callDoc.status = "ringing";
          callDoc.toNumber = normalizedTo;
          await callDoc.save();
          console.log(`Updated existing call record ${callSid} to ringing`);
        }
      } catch (saveError) {
        // Don't fail the TwiML response if saving fails
        console.error("Error saving call record:", saveError);
      }
    }

    res.type("text/xml");
    res.status(200).send(twiml.toString());
  } catch (error) {
    console.error("Outbound bridge error:", error);
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const errorTwiml = new VoiceResponse();
    errorTwiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "We're sorry, we're experiencing technical difficulties."
    );
    errorTwiml.hangup();
    res.type("text/xml").status(200).send(errorTwiml.toString());
  }
};

/**
 * ============================================================================
 * ADMIN API ENDPOINTS (Protected, requires authentication)
 * ============================================================================
 */

/**
 * List calls with filters
 * GET /api/twilio/calls
 */
exports.listCalls = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      direction,
      agentExtension,
      agentId,
      phone,
      mcaId,
      hasRecording,
      fromDate,
      toDate,
      status,
    } = req.query;

    // Validate pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // Build query
    const query = {};

    if (direction && ["inbound", "outbound"].includes(direction)) {
      query.direction = direction;
    }

    if (agentExtension && isValidExtension(agentExtension)) {
      query.agentExtension = agentExtension.trim();
    }

    if (agentId) {
      if (!mongoose.Types.ObjectId.isValid(agentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid agentId format",
        });
      }
      query.agentId = agentId;
    }

    if (mcaId) {
      if (!mongoose.Types.ObjectId.isValid(mcaId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid mcaId format",
        });
      }
      query.mcaId = mcaId;
    }

    if (phone) {
      const normalizedPhone = normalizePhoneNumber(phone);
      if (normalizedPhone) {
        query.$or = [
          { fromNumber: normalizedPhone },
          { toNumber: normalizedPhone },
        ];
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid phone number format",
        });
      }
    }

    if (hasRecording === "true") {
      query.recordingUrl = { $exists: true, $ne: null };
    }

    if (status) {
      query.status = status;
    }

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) {
        const from = new Date(fromDate);
        if (isNaN(from.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid fromDate format",
          });
        }
        query.createdAt.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        if (isNaN(to.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid toDate format",
          });
        }
        query.createdAt.$lte = to;
      }
    }

    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Call.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("mcaId", "company uniqueId")
        .populate("userResponseId", "uniqueId formData")
        .populate("agentId", "name email")
        .lean(),
      Call.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("List calls error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching calls",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * List all extensions
 * GET /api/twilio/extensions
 */
exports.listExtensions = async (req, res) => {
  try {
    const items = await AgentExtension.find()
      .sort({ extension: 1 })
      .populate("userId", "name email")
      .lean();

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error("List extensions error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching extensions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Create or update extension
 * POST /api/twilio/extensions
 * PUT /api/twilio/extensions/:id
 */
exports.createOrUpdateExtension = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    // Validation
    if (payload.extension && !isValidExtension(payload.extension)) {
      return res.status(400).json({
        success: false,
        message: "Extension must be 3-4 digits",
      });
    }

    if (payload.forwardingNumber) {
      const normalized = normalizePhoneNumber(payload.forwardingNumber);
      if (!normalized || !isValidPhoneNumber(normalized)) {
        return res.status(400).json({
          success: false,
          message: "Invalid forwarding number format. Use E.164 format (e.g., +1234567890)",
        });
      }
      payload.forwardingNumber = normalized;
    }

    if (payload.userId && !mongoose.Types.ObjectId.isValid(payload.userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid userId format",
      });
    }

    if (id) {
      // Update existing
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid extension ID format",
        });
      }

      const updated = await AgentExtension.findByIdAndUpdate(
        id,
        { $set: payload },
        { new: true, runValidators: true }
      )
        .populate("userId", "name email")
        .lean();

      if (!updated) {
        return res.status(404).json({
          success: false,
          message: "Extension not found",
        });
      }

      return res.json({
        success: true,
        message: "Extension updated successfully",
        data: updated,
      });
    } else {
      // Create new
      if (!payload.name || !payload.extension) {
        return res.status(400).json({
          success: false,
          message: "Name and extension are required",
        });
      }

      // Check for duplicate extension
      const existing = await AgentExtension.findOne({
        extension: payload.extension,
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "Extension already exists",
        });
      }

      const created = await AgentExtension.create(payload);
      // @ts-expect-error - Mongoose create returns single document, TypeScript types incorrectly infer array
      // eslint-disable-next-line
      const populated = await AgentExtension.findById(created._id)
        .populate("userId", "name email")
        .lean();

      res.status(201).json({
        success: true,
        message: "Extension created successfully",
        data: populated,
      });
    }
  } catch (error) {
    console.error("Create/update extension error:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Extension already exists",
      });
    }

    // Handle validation errors
    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: Object.values(error.errors).map((e) => e.message),
      });
    }

    res.status(500).json({
      success: false,
      message: "Error saving extension",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Delete extension
 * DELETE /api/twilio/extensions/:id
 */
exports.deleteExtension = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid extension ID format",
      });
    }

    const deleted = await AgentExtension.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Extension not found",
      });
    }

    res.json({
      success: true,
      message: "Extension deleted successfully",
    });
  } catch (error) {
    console.error("Delete extension error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting extension",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get dialer configuration
 * @returns {Promise<Object>} Dialer configuration
 */
async function getDialerConfig() {
  try {
    const config = await AdminConfig.findOne({ configId: "default" });
    return config?.dialer || { defaultMethod: "direct" };
  } catch (error) {
    console.error("Error getting dialer config:", error);
    return { defaultMethod: "direct" };
  }
}

/**
 * Search companies/contacts for dialer
 * GET /api/twilio/dialer/search
 */
exports.searchCompanies = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const searchTerm = q.trim();
    const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); // Escape special regex chars

    // Extract phone digits from search term
    const phoneDigits = searchTerm.replace(/\D/g, "");
    const hasPhoneDigits = phoneDigits.length >= 3;

    // Build phone regex patterns for partial matching
    const phoneRegex = hasPhoneDigits ? new RegExp(phoneDigits, "i") : null;

    // Search in MCA records (company name and phone)
    // Build query conditions - MCA has dynamic fields (strict: false)
    const mcaOrConditions = [
      { company: searchRegex },
      { uniqueId: searchRegex },
    ];

    // Add phone search conditions using $regex (not $in)
    if (hasPhoneDigits && phoneRegex) {
      // MCA has dynamic fields, search common phone field names using regex
      const phoneFields = [
        "phoneNumber",
        "phone",
        "mobile",
        "businessPhone",
        "ownerPhone",
        "contactPhone",
        "phone2",
        "phone3",
        "Business Phone",
        "Owner Phone",
        "Contact Phone",
        "Phone Number",
      ];

      // Build regex conditions for each phone field
      for (const field of phoneFields) {
        // @ts-ignore - MCA schema has strict: false, allows dynamic fields
        mcaOrConditions.push({
          [field]: phoneRegex,
        });
      }
    }

    // @ts-ignore - MCA schema has strict: false
    const mcaQuery = {
      isActive: true,
      $or: mcaOrConditions,
    };

    // Search in UserResponse records (phone numbers and company names)
    const userResponseOrConditions = [
      { "formData.legalBusinessName": searchRegex },
      { "formData.businessInfo.businessName": searchRegex },
      { "formData.businessInfo.companyName": searchRegex },
      { "formData.company": searchRegex },
      { "formData.businessName": searchRegex },
    ];

    // Add phone search conditions using $regex
    if (hasPhoneDigits && phoneRegex) {
      const phoneConditions = [
        { "userContact.phone": phoneRegex },
        { "formData.phone": phoneRegex },
        { "formData.businessPhone": phoneRegex },
        { "formData.ownerPhone": phoneRegex },
        { "formData.ownerInfo.phone": phoneRegex },
        { "formData.phoneNumber": phoneRegex },
      ];
      // @ts-ignore - UserResponse formData is Mixed type, allows dynamic fields
      userResponseOrConditions.push(...phoneConditions);
    }

    // @ts-ignore - UserResponse formData is Mixed type
    const userResponseQuery = {
      isActive: true,
      $or: userResponseOrConditions,
    };

    // Execute searches in parallel
    const [mcaResults, userResponseResults] = await Promise.all([
      MCA.find(mcaQuery)
        .select("_id company uniqueId phoneNumber phone mobile businessPhone ownerPhone contactPhone phone2 phone3")
        .limit(50)
        .lean(),
      UserResponse.find(userResponseQuery)
        .select("_id mcaId formData userContact")
        .populate("mcaId", "company uniqueId phoneNumber")
        .limit(50)
        .lean(),
    ]);

    // Combine and format results
    const results = [];
    const seenPhones = new Set(); // Avoid duplicates

    // Add MCA results
    for (const mca of mcaResults) {
      // Try multiple phone field names (MCA has dynamic fields - strict: false)
      // Use bracket notation and type assertion to avoid TypeScript errors
      const mcaAny = mca;
      // @ts-ignore - MCA schema has strict: false, allows dynamic fields
      const phone =
        mcaAny["phoneNumber"] || // Primary field from import script
        mcaAny["phone"] ||
        mcaAny["mobile"] ||
        mcaAny["businessPhone"] ||
        mcaAny["ownerPhone"] ||
        mcaAny["contactPhone"] ||
        mcaAny["phone2"] ||
        mcaAny["phone3"] ||
        mcaAny["Business Phone"] ||
        mcaAny["Owner Phone"] ||
        mcaAny["Contact Phone"] ||
        mcaAny["Phone Number"] ||
        null;

      if (phone) {
        // Normalize phone for deduplication
        const normalizedPhone = phone.toString().replace(/\D/g, "");
        // Only add if we have at least 10 digits (valid phone number)
        if (normalizedPhone.length >= 10 && !seenPhones.has(normalizedPhone)) {
          seenPhones.add(normalizedPhone);
          results.push({
            id: mca._id.toString(),
            type: "mca",
            // @ts-ignore - MCA has dynamic fields
            companyName: mcaAny["company"] || mcaAny["name"] || "Unknown Company",
            phoneNumber: phone.toString(),
            uniqueId: mca.uniqueId,
          });
        }
      }
    }

    // Add UserResponse results
    for (const response of userResponseResults) {
      const phone =
        response.userContact?.phone ||
        response.formData?.phone ||
        response.formData?.phoneNumber ||
        response.formData?.businessPhone ||
        response.formData?.ownerPhone ||
        response.formData?.ownerInfo?.phone ||
        null;

      const companyName =
        response.formData?.legalBusinessName ||
        response.formData?.businessInfo?.businessName ||
        response.formData?.businessInfo?.companyName ||
        response.formData?.company ||
        response.formData?.businessName ||
        // @ts-ignore - mcaId populated, has company field
        response.mcaId?.company ||
        null;

      if (phone) {
        // Normalize phone for deduplication
        const normalizedPhone = phone.toString().replace(/\D/g, "");
        // Only add if we have at least 10 digits (valid phone number)
        if (normalizedPhone.length >= 10 && !seenPhones.has(normalizedPhone)) {
          seenPhones.add(normalizedPhone);
          results.push({
            id: response._id.toString(),
            type: "userResponse",
            companyName: companyName || response.mcaId?.company || "Unknown Company",
            phoneNumber: phone.toString(),
            mcaId: response.mcaId?._id?.toString(),
            // @ts-ignore - mcaId populated, has uniqueId field
            uniqueId: response.mcaId?.uniqueId || response.uniqueId,
          });
        }
      }
    }

    // Sort by relevance (exact matches first, then partial)
    results.sort((a, b) => {
      const aExact = a.companyName.toLowerCase() === searchTerm.toLowerCase();
      const bExact = b.companyName.toLowerCase() === searchTerm.toLowerCase();
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return 0;
    });

    res.json({
      success: true,
      data: results.slice(0, 20), // Limit to 20 results
    });
  } catch (error) {
    console.error("Search companies error:", error);
    res.status(500).json({
      success: false,
      message: "Error searching companies",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Diagnostic endpoint to verify Twilio configuration and webhook URLs
 * GET /api/twilio/diagnostics
 */
exports.getDiagnostics = async (req, res) => {
  try {
    const twilioConfig = await getTwilioConfig();
    const baseUrl = getBaseUrl(req);

    // Build all the webhook URLs that need to be configured
    const webhookUrls = {
      inboundVoice: buildTwiMLUrl(baseUrl, "/voice/inbound"),
      outboundBridge: buildTwiMLUrl(baseUrl, "/outbound-bridge"),
      callStatus: buildTwiMLUrl(baseUrl, "/call-status"),
      recordingStatus: buildTwiMLUrl(baseUrl, "/recording-status"),
      voicemailGreeting: buildTwiMLUrl(baseUrl, "/voicemail-greeting"),
      voicemail: buildTwiMLUrl(baseUrl, "/voicemail"),
    };

    // Check configuration status
    const configStatus = {
      hasAccountSid: !!twilioConfig.accountSid,
      hasAuthToken: !!twilioConfig.authToken,
      hasApiKey: !!twilioConfig.apiKey,
      hasApiSecret: !!twilioConfig.apiSecret,
      hasTwimlAppSid: !!twilioConfig.twimlAppSid,
      hasPrimaryNumber: !!twilioConfig.primaryNumber,
      hasOutboundCallerId: !!twilioConfig.outboundCallerId,
      recordingsEnabled: twilioConfig.recordings?.enabled ?? false,
    };

    // Generate setup instructions
    const setupInstructions = [];

    if (!configStatus.hasApiKey || !configStatus.hasApiSecret) {
      setupInstructions.push({
        step: 1,
        title: "Create API Key",
        description: "Go to Twilio Console → Account → API Keys & Tokens → Create API Key",
        url: "https://console.twilio.com/us1/account/keys-credentials/api-keys",
      });
    }

    if (!configStatus.hasTwimlAppSid) {
      setupInstructions.push({
        step: 2,
        title: "Create TwiML Application",
        description: `Go to Twilio Console → Voice → TwiML Apps → Create new TwiML App. Set Voice URL to: ${webhookUrls.outboundBridge}`,
        url: "https://console.twilio.com/us1/develop/voice/manage/twiml-apps",
        voiceUrl: webhookUrls.outboundBridge,
      });
    }

    setupInstructions.push({
      step: 3,
      title: "Configure Phone Number Webhooks",
      description: `Go to Twilio Console → Phone Numbers → Active Numbers → Select your number. Set Voice webhook to: ${webhookUrls.inboundVoice}`,
      url: "https://console.twilio.com/us1/develop/phone-numbers/manage/incoming",
      voiceUrl: webhookUrls.inboundVoice,
    });

    res.json({
      success: true,
      data: {
        baseUrl,
        webhookUrls,
        configStatus,
        setupInstructions,
        // Masked credentials for verification
        credentials: {
          accountSid: twilioConfig.accountSid
            ? `${twilioConfig.accountSid.substring(0, 6)}...${twilioConfig.accountSid.slice(-4)}`
            : null,
          twimlAppSid: twilioConfig.twimlAppSid
            ? `${twilioConfig.twimlAppSid.substring(0, 6)}...${twilioConfig.twimlAppSid.slice(-4)}`
            : null,
          primaryNumber: twilioConfig.primaryNumber || null,
          outboundCallerId: twilioConfig.outboundCallerId || null,
        },
        // Check if the API is accessible
        apiAccessible: true,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Diagnostics error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching diagnostics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Generate Twilio access token for web-based softphone (Client SDK)
 * GET /api/twilio/dialer/token
 *
 * IMPORTANT: For the web dialer to work, you need:
 * 1. A TwiML Application created in Twilio Console (Voice > TwiML Apps)
 * 2. The TwiML App's Voice URL set to: https://your-api-domain.com/api/twilio/outbound-bridge
 * 3. API Key and API Secret configured (not just Account SID/Auth Token)
 * 4. The twimlAppSid stored in AdminConfig.twilio or TwilioAccount
 */
exports.generateDialerToken = async (req, res) => {
  try {
    // Optional ability to target a specific Twilio account for the dialer
    const { twilioAccountId, accountId } = req.query;
    const twilioConfig = await getTwilioConfig(
      twilioAccountId || accountId ? { accountId: twilioAccountId || accountId } : undefined
    );

    // Check if API Key/Secret are configured (required for Client SDK)
    if (!twilioConfig.apiKey || !twilioConfig.apiSecret) {
      return res.status(400).json({
        success: false,
        message: "Twilio API Key and API Secret must be configured for web dialer. Please create an API Key in Twilio Console > Account > API Keys & Tokens, then configure them in the admin panel.",
      });
    }

    // Check if TwiML App SID is configured (required for Voice SDK outbound calls)
    if (!twilioConfig.twimlAppSid) {
      return res.status(400).json({
        success: false,
        message: "TwiML Application SID must be configured for web dialer. Please create a TwiML App in Twilio Console > Voice > TwiML Apps, set its Voice URL to your /api/twilio/outbound-bridge endpoint, then configure the App SID in the admin panel.",
      });
    }

    // Twilio Access Token for Client SDK
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    // Create identity for the user (must be unique per user/session)
    const identity = req.user?.email || `agent-${req.user?.id || Date.now()}`;

    // Create access token
    const token = new AccessToken(
      twilioConfig.accountSid,
      twilioConfig.apiKey,
      twilioConfig.apiSecret,
      {
        identity: identity,
        ttl: 3600, // 1 hour
      }
    );

    // Add voice grant with TwiML Application SID
    // The TwiML App's Voice URL will be called when device.connect() is invoked
    // Twilio will POST to that URL with the parameters passed in device.connect({ params })
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twilioConfig.twimlAppSid, // TwiML App SID (REQUIRED for outbound)
      incomingAllow: false, // Only outbound calls for now
    });

    token.addGrant(voiceGrant);

    // Build voice URL for reference (the TwiML App should be configured with this URL)
    const baseUrl = getBaseUrl(req);
    const voiceUrl = buildTwiMLUrl(baseUrl, "/outbound-bridge");

    res.json({
      success: true,
      data: {
        token: token.toJwt(),
        identity: identity,
        accountSid: twilioConfig.accountSid,
        primaryNumber: twilioConfig.primaryNumber,
        outboundCallerId: twilioConfig.outboundCallerId || twilioConfig.primaryNumber,
        voiceUrl: voiceUrl, // For reference - TwiML App should use this URL
        twimlAppSid: twilioConfig.twimlAppSid, // For debugging
        // Multi-account aware clients can use this metadata
        twilioAccountId: twilioConfig._accountId || null,
        phoneNumbers: twilioConfig._phoneNumbers || [],
        accountName: twilioConfig._name || null,
      },
    });
  } catch (error) {
    console.error("Generate dialer token error:", error);
    res.status(500).json({
      success: false,
      message: "Error generating dialer token",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Create outbound call (click-to-call)
 * POST /api/twilio/dialer/outbound
 * Supports multiple dial methods: direct, softphone, ghl, deskphone, ivr
 */
exports.createOutboundCall = async (req, res) => {
  try {
    // Optional multi-account support
    const { twilioAccountId, accountId } = req.body || {};
    const twilioConfig = await getTwilioConfig(
      twilioAccountId || accountId ? { accountId: twilioAccountId || accountId } : undefined
    );
    const dialerConfig = await getDialerConfig();
    const client = await createTwilioClient();

    const { toNumber, agentExtension, dialMethod, fromNumber } = req.body;
    const method = dialMethod || dialerConfig.defaultMethod || "direct";

    // Validate required fields
    if (!toNumber) {
      return res.status(400).json({
        success: false,
        message: "toNumber is required",
      });
    }

    // Normalize and validate phone number
    const normalizedTo = normalizePhoneNumber(toNumber);
    if (!normalizedTo || !isValidPhoneNumber(normalizedTo)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format. Use E.164 format (e.g., +1234567890)",
      });
    }

    // Get from number
    const fromNumberRaw =
      fromNumber || twilioConfig.outboundCallerId || twilioConfig.primaryNumber;
    if (!fromNumberRaw) {
      return res.status(400).json({
        success: false,
        message:
          "Twilio primaryNumber or outboundCallerId is not configured in admin panel",
      });
    }

    const normalizedFrom = normalizePhoneNumber(fromNumberRaw);
    if (!normalizedFrom || !isValidPhoneNumber(normalizedFrom)) {
      return res.status(500).json({
        success: false,
        message: "Invalid Twilio configuration: primary number format is invalid",
      });
    }

    // Find agent if extension provided
    let agent = null;
    if (agentExtension) {
      if (!isValidExtension(agentExtension)) {
        return res.status(400).json({
          success: false,
          message: "Invalid agent extension format",
        });
      }

      agent = await AgentExtension.findOne({
        extension: agentExtension.trim(),
        isActive: true,
      }).populate("userId");

      if (!agent) {
        return res.status(404).json({
          success: false,
          message: "Agent extension not found or inactive",
        });
      }
    }

    // Handle different dial methods
    if (method === "softphone") {
      // For softphone, return Twilio access token for client SDK
      const AccessToken = twilio.jwt.AccessToken;
      const VoiceGrant = AccessToken.VoiceGrant;

      const identity = req.user?.email || `agent-${req.user?.id || Date.now()}`;

      const token = new AccessToken(
        twilioConfig.accountSid,
        twilioConfig.apiKey || twilioConfig.accountSid,
        twilioConfig.apiSecret || twilioConfig.authToken,
        {
          identity: identity,
          ttl: 3600,
        }
      );

      token.identity = req.user?.email || `agent-${req.user?.id || "unknown"}`;

      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: twilioConfig.apiKey || undefined,
        incomingAllow: false,
      });

      token.addGrant(voiceGrant);

      return res.json({
        success: true,
        message: "Softphone token generated",
        data: {
          token: token.toJwt(),
          toNumber: normalizedTo,
          fromNumber: normalizedFrom,
          method: "softphone",
        },
      });
    }

    if (method === "ghl" && dialerConfig.ghl?.enabled) {
      // Send webhook to GoHighLevel
      // @ts-ignore - axios is available
      const axiosLib = require("axios");
      try {
        const ghlPayload = {
          phoneNumber: normalizedTo,
          contactId: req.body.contactId || null,
          userId: req.user?.id || null,
        };

        // @ts-ignore - axios.post exists at runtime
        await axiosLib.post(dialerConfig.ghl.webhookUrl, ghlPayload, {
          headers: {
            Authorization: `Bearer ${dialerConfig.ghl.apiKey}`,
            "Content-Type": "application/json",
          },
        });

        return res.json({
          success: true,
          message: "Call initiated via GoHighLevel",
          data: {
            method: "ghl",
            toNumber: normalizedTo,
          },
        });
      } catch (ghlError) {
        console.error("GHL webhook error:", ghlError);
        return res.status(502).json({
          success: false,
          message: "Failed to initiate call via GoHighLevel",
        });
      }
    }

    if (method === "deskphone" && dialerConfig.deskphone?.enabled) {
      // SIP dialing - bridge to deskphone extension
      if (!agent || !agent.forwardingNumber) {
        return res.status(400).json({
          success: false,
          message: "Agent extension required for deskphone dialing",
        });
      }

      const baseUrl = getBaseUrl(req);
      const twimlUrl = buildTwiMLUrl(baseUrl, "/outbound-bridge", {
        to: normalizedTo,
      });
      const statusCallbackUrl = buildTwiMLUrl(baseUrl, "/call-status");
      const recordingCallbackUrl = buildTwiMLUrl(baseUrl, "/recording-status");

      const shouldRecord =
        twilioConfig.recordings?.enabled &&
        twilioConfig.recordings?.recordOutbound === true;

      // Call agent's deskphone first, then bridge to customer
      const callOptions = {
        from: normalizedFrom,
        to: normalizePhoneNumber(agent.forwardingNumber),
        url: twimlUrl,
        statusCallback: statusCallbackUrl,
        statusCallbackMethod: "POST",
        record: shouldRecord ? "record-from-answer-dual" : "do-not-record",
        recordingStatusCallback: shouldRecord ? recordingCallbackUrl : undefined,
        recordingStatusCallbackMethod: shouldRecord ? "POST" : undefined,
      };

      // @ts-expect-error - Twilio SDK accepts string for record property, TypeScript types are incorrect
      const twilioCall = await client.calls.create(callOptions);

      // Save call record
      const callData = {
        twilioCallSid: twilioCall.sid,
        direction: "outbound",
        fromNumber: normalizedFrom,
        toNumber: normalizedTo,
        agentExtension: agent.extension,
        agentId: agent.userId?._id || null,
        status: twilioCall.status,
        metadata: {
          outboundRequest: {
            toNumber: normalizedTo,
            agentExtension: agentExtension,
            method: "deskphone",
            requestedBy: req.user?.id || null,
          },
        },
      };

      const callDoc = new Call(callData);
      await attachBusinessContext(callDoc);
      await callDoc.save();

      return res.json({
        success: true,
        message: "Deskphone call initiated",
        data: {
          callSid: twilioCall.sid,
          status: twilioCall.status,
          method: "deskphone",
          toNumber: normalizedTo,
          agentExtension: agent.extension,
        },
      });
    }

    // Default: Direct dialing (original implementation)
    const baseUrl = getBaseUrl(req);
    const twimlUrl = buildTwiMLUrl(baseUrl, "/outbound-bridge", {
      to: normalizedTo,
    });
    const statusCallbackUrl = buildTwiMLUrl(baseUrl, "/call-status");
    const recordingCallbackUrl = buildTwiMLUrl(baseUrl, "/recording-status");

    // Determine recording preference
    const shouldRecord =
      twilioConfig.recordings?.enabled &&
      twilioConfig.recordings?.recordOutbound === true;

    // Create Twilio call
    let twilioCall;
    try {
      const callOptions = {
        from: normalizedFrom,
        to: agent?.forwardingNumber
          ? normalizePhoneNumber(agent.forwardingNumber)
          : normalizedTo,
        url: twimlUrl,
        statusCallback: statusCallbackUrl,
        statusCallbackMethod: "POST",
        statusCallbackEvent: [
          "initiated",
          "ringing",
          "answered",
          "completed",
        ],
      };

      if (shouldRecord) {
        callOptions.record = "record-from-answer-dual";
        callOptions.recordingStatusCallback = recordingCallbackUrl;
        callOptions.recordingStatusCallbackMethod = "POST";
      } else {
        callOptions.record = "do-not-record";
      }

      twilioCall = await client.calls.create(callOptions);
    } catch (twilioError) {
      console.error("Twilio API error:", twilioError);
      return res.status(502).json({
        success: false,
        message: "Failed to initiate call via Twilio",
        error:
          process.env.NODE_ENV === "development"
            ? twilioError.message
            : undefined,
      });
    }

    // Save call record
    try {
      const callData = {
        twilioCallSid: twilioCall.sid,
        direction: "outbound",
        fromNumber: normalizedFrom,
        toNumber: normalizedTo,
        agentExtension: agent?.extension || null,
        agentId: agent?.userId?._id || null,
        status: twilioCall.status,
        metadata: {
          outboundRequest: {
            toNumber: normalizedTo,
            agentExtension: agentExtension || null,
            method: method,
            requestedBy: req.user?.id || null,
          },
        },
      };

      const callDoc = new Call(callData);
      await attachBusinessContext(callDoc);
      await callDoc.save();
    } catch (dbError) {
      // Log but don't fail the request if DB save fails
      console.error("Error saving outbound call record:", dbError);
    }

    res.json({
      success: true,
      message: "Outbound call initiated successfully",
      data: {
        callSid: twilioCall.sid,
        status: twilioCall.status,
        direction: "outbound",
        from: normalizedFrom,
        to: normalizedTo,
        agentExtension: agent?.extension || null,
        method: method,
      },
    });
  } catch (error) {
    console.error("Create outbound call error:", error);

    // Handle configuration errors
    if (error.message.includes("not configured")) {
      return res.status(503).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating outbound call",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get call statistics
 * GET /api/twilio/calls/stats
 */
exports.getCallStats = async (req, res) => {
  try {
    const { fromDate, toDate, agentId } = req.query;

    // Build date filter
    const dateFilter = {};
    if (fromDate) {
      const from = new Date(fromDate);
      if (!isNaN(from.getTime())) {
        dateFilter.$gte = from;
      }
    }
    if (toDate) {
      const to = new Date(toDate);
      if (!isNaN(to.getTime())) {
        // Set to end of day
        to.setHours(23, 59, 59, 999);
        dateFilter.$lte = to;
      }
    }

    // Build base query
    const baseQuery = {};
    if (Object.keys(dateFilter).length > 0) {
      baseQuery.createdAt = dateFilter;
    }
    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) {
      baseQuery.agentId = new mongoose.Types.ObjectId(agentId);
    }

    // Aggregate statistics
    const [
      totalStats,
      directionStats,
      statusStats,
      agentStats,
      dailyStats,
      hourlyStats,
    ] = await Promise.all([
      // Total calls and duration
      Call.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: null,
            totalCalls: { $sum: 1 },
            totalDuration: { $sum: { $ifNull: ["$durationSeconds", 0] } },
            avgDuration: { $avg: { $ifNull: ["$durationSeconds", 0] } },
            totalWithRecording: {
              $sum: { $cond: [{ $ifNull: ["$recordingUrl", false] }, 1, 0] },
            },
          },
        },
      ]),

      // Calls by direction
      Call.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: "$direction",
            count: { $sum: 1 },
            totalDuration: { $sum: { $ifNull: ["$durationSeconds", 0] } },
          },
        },
      ]),

      // Calls by status
      Call.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),

      // Calls by agent
      Call.aggregate([
        { $match: { ...baseQuery, agentId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$agentId",
            count: { $sum: 1 },
            totalDuration: { $sum: { $ifNull: ["$durationSeconds", 0] } },
            avgDuration: { $avg: { $ifNull: ["$durationSeconds", 0] } },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "agent",
          },
        },
        { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            count: 1,
            totalDuration: 1,
            avgDuration: 1,
            agentName: { $ifNull: ["$agent.name", "$agent.email"] },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Daily call volume (last 30 days or within date range)
      Call.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            inbound: {
              $sum: { $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0] },
            },
            outbound: {
              $sum: { $cond: [{ $eq: ["$direction", "outbound"] }, 1, 0] },
            },
            total: { $sum: 1 },
            totalDuration: { $sum: { $ifNull: ["$durationSeconds", 0] } },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 30 },
      ]),

      // Hourly distribution
      Call.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: { $hour: "$createdAt" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Calculate voicemail/missed calls
    const missedStatuses = ["no-answer", "busy", "failed", "canceled"];
    const missedCount = statusStats
      .filter((s) => missedStatuses.includes(s._id?.toLowerCase()))
      .reduce((sum, s) => sum + s.count, 0);

    const completedCount =
      statusStats.find((s) => s._id?.toLowerCase() === "completed")?.count || 0;

    res.json({
      success: true,
      data: {
        overview: {
          totalCalls: totalStats[0]?.totalCalls || 0,
          totalDuration: Math.round(totalStats[0]?.totalDuration || 0),
          avgDuration: Math.round(totalStats[0]?.avgDuration || 0),
          totalWithRecording: totalStats[0]?.totalWithRecording || 0,
          completedCalls: completedCount,
          missedCalls: missedCount,
        },
        byDirection: directionStats.reduce((acc, item) => {
          acc[item._id || "unknown"] = {
            count: item.count,
            totalDuration: Math.round(item.totalDuration),
          };
          return acc;
        }, {}),
        byStatus: statusStats.reduce((acc, item) => {
          acc[item._id || "unknown"] = item.count;
          return acc;
        }, {}),
        byAgent: agentStats,
        dailyVolume: dailyStats,
        hourlyDistribution: hourlyStats,
      },
    });
  } catch (error) {
    console.error("Get call stats error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching call statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * ============================================================================
 * TWILIO ACCOUNT MANAGEMENT (GLOBAL, MULTI-ACCOUNT SUPPORT)
 * ============================================================================
 */

/**
 * List all Twilio accounts
 * GET /api/twilio/accounts
 */
exports.listTwilioAccounts = async (req, res) => {
  try {
    const accounts = await TwilioAccount.find().sort({ createdAt: -1 }).lean();

    res.json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    console.error("List Twilio accounts error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching Twilio accounts",
      error:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Create or update a Twilio account
 * POST /api/twilio/accounts (create)
 * PUT /api/twilio/accounts/:id (update)
 */
exports.createOrUpdateTwilioAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    if (!payload.name || !payload.accountSid || !payload.authToken) {
      return res.status(400).json({
        success: false,
        message: "name, accountSid and authToken are required",
      });
    }

    // Normalize phoneNumbers array
    if (Array.isArray(payload.phoneNumbers)) {
      payload.phoneNumbers = payload.phoneNumbers
        .filter((n) => n && n.phoneNumber)
        .map((n) => ({
          phoneNumber: n.phoneNumber,
          label: n.label || "",
          isPrimary: !!n.isPrimary,
          isOutboundCallerId: n.isOutboundCallerId !== false,
          isActive: n.isActive !== false,
        }));
    }

    let account;
    if (id) {
      // Update existing
      account = await TwilioAccount.findByIdAndUpdate(id, payload, {
        new: true,
        runValidators: true,
      }).lean();

      if (!account) {
        return res.status(404).json({
          success: false,
          message: "Twilio account not found",
        });
      }
    } else {
      // Create new
      account = await TwilioAccount.create(payload);
    }

    res.json({
      success: true,
      message: id
        ? "Twilio account updated successfully"
        : "Twilio account created successfully",
      data: account,
    });
  } catch (error) {
    console.error("Create/update Twilio account error:", error);
    res.status(500).json({
      success: false,
      message: "Error saving Twilio account",
      error:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Delete a Twilio account
 * DELETE /api/twilio/accounts/:id
 */
exports.deleteTwilioAccount = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Account id is required",
      });
    }

    const deleted = await TwilioAccount.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Twilio account not found",
      });
    }

    res.json({
      success: true,
      message: "Twilio account deleted successfully",
    });
  } catch (error) {
    console.error("Delete Twilio account error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting Twilio account",
      error:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Lightweight endpoint for dialer to get active caller IDs
 * GET /api/twilio/accounts/caller-ids
 */
exports.listTwilioCallerIds = async (req, res) => {
  try {
    const accounts = await TwilioAccount.find({
      "phoneNumbers.isActive": true,
      "phoneNumbers.isOutboundCallerId": true,
    })
      .select("name isDefault phoneNumbers")
      .lean();

    const items = [];

    for (const acc of accounts) {
      for (const n of acc.phoneNumbers || []) {
        if (!n.isActive || n.isOutboundCallerId === false) continue;

        items.push({
          accountId: acc._id.toString(),
          accountName: acc.name,
          isDefaultAccount: !!acc.isDefault,
          phoneNumber: n.phoneNumber,
          label: n.label || "",
          isPrimary: !!n.isPrimary,
        });
      }
    }

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error("List Twilio caller IDs error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching Twilio caller IDs",
      error:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Proxy endpoint for streaming Twilio recordings
 * This avoids exposing Twilio credentials to the frontend
 * GET /api/twilio/calls/:callId/recording
 */
exports.getCallRecording = async (req, res) => {
  try {
    const { callId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(callId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid call ID format",
      });
    }

    const call = await Call.findById(callId).lean();

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    if (!call.recordingUrl) {
      return res.status(404).json({
        success: false,
        message: "No recording available for this call",
      });
    }

    // Download the recording from Twilio with authentication
    const { buffer, contentType } = await downloadTwilioRecording(
      call.recordingUrl
    );

    // Set appropriate headers for audio streaming
    res.set({
      "Content-Type": contentType,
      "Content-Length": buffer.length,
      "Content-Disposition": `inline; filename="recording-${callId}.mp3"`,
      "Cache-Control": "private, max-age=3600", // Cache for 1 hour
    });

    res.send(buffer);
  } catch (error) {
    console.error("Get call recording error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching recording",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Manually trigger transcription and summary for a call
 * POST /api/twilio/calls/:callId/transcribe
 */
exports.transcribeCall = async (req, res) => {
  try {
    const { callId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(callId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid call ID format",
      });
    }

    const call = await Call.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    if (!call.recordingUrl) {
      return res.status(400).json({
        success: false,
        message: "No recording available for this call. Cannot transcribe.",
      });
    }

    // Check if already transcribed
    if (call.transcription?.status === "completed" && call.transcription?.text) {
      return res.json({
        success: true,
        message: "Call already transcribed",
        data: {
          transcription: call.transcription.text,
          summary: call.summary?.text || null,
        },
      });
    }

    // Process the recording (transcribe + summarize)
    const result = await processCallRecording(call);

    // Reload the call to get updated data
    const updatedCall = await Call.findById(callId).lean();

    res.json({
      success: true,
      message:
        result.errors.length > 0
          ? "Processing completed with some errors"
          : "Transcription and summary completed successfully",
      data: {
        transcription: updatedCall.transcription?.text || null,
        transcriptionStatus: updatedCall.transcription?.status || "pending",
        summary: updatedCall.summary?.text || null,
        summaryStatus: updatedCall.summary?.status || "pending",
        errors: result.errors,
      },
    });
  } catch (error) {
    console.error("Transcribe call error:", error);
    res.status(500).json({
      success: false,
      message: "Error transcribing call",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get a single call with full details
 * GET /api/twilio/calls/:callId
 */
exports.getCallById = async (req, res) => {
  try {
    const { callId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(callId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid call ID format",
      });
    }

    const call = await Call.findById(callId)
      .populate("mcaId", "company uniqueId")
      .populate("userResponseId", "uniqueId formData")
      .populate("agentId", "name email")
      .lean();

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    // Add a proxied recording URL if recording exists
    if (call.recordingUrl) {
      call.recordingProxyUrl = `/api/twilio/calls/${callId}/recording`;
    }

    res.json({
      success: true,
      data: call,
    });
  } catch (error) {
    console.error("Get call by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching call",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Export calls to CSV
 * GET /api/twilio/calls/export
 */
exports.exportCallsToCSV = async (req, res) => {
  try {
    const {
      direction,
      agentExtension,
      agentId,
      phone,
      mcaId,
      hasRecording,
      fromDate,
      toDate,
      status,
    } = req.query;

    // Build query (same as listCalls)
    const query = {};

    if (direction && ["inbound", "outbound"].includes(direction)) {
      query.direction = direction;
    }

    if (agentExtension && isValidExtension(agentExtension)) {
      query.agentExtension = agentExtension.trim();
    }

    if (agentId && mongoose.Types.ObjectId.isValid(agentId)) {
      query.agentId = agentId;
    }

    if (mcaId && mongoose.Types.ObjectId.isValid(mcaId)) {
      query.mcaId = mcaId;
    }

    if (phone) {
      const normalizedPhone = normalizePhoneNumber(phone);
      if (normalizedPhone) {
        query.$or = [
          { fromNumber: normalizedPhone },
          { toNumber: normalizedPhone },
        ];
      }
    }

    if (hasRecording === "true") {
      query.recordingUrl = { $exists: true, $ne: null };
    }

    if (status) {
      query.status = status;
    }

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) {
        const from = new Date(fromDate);
        if (!isNaN(from.getTime())) {
          query.createdAt.$gte = from;
        }
      }
      if (toDate) {
        const to = new Date(toDate);
        if (!isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          query.createdAt.$lte = to;
        }
      }
    }

    // Fetch all matching calls (limit to 10000 for safety)
    const calls = await Call.find(query)
      .sort({ createdAt: -1 })
      .limit(10000)
      .populate("mcaId", "company uniqueId")
      .populate("agentId", "name email")
      .lean();

    // Build CSV
    const headers = [
      "Date",
      "Time",
      "Direction",
      "From",
      "To",
      "Business",
      "Business ID",
      "Agent",
      "Agent Extension",
      "Status",
      "Duration (seconds)",
      "Has Recording",
      "Recording URL",
      "Transcription",
      "Summary",
      "Call SID",
    ];

    const rows = calls.map((call) => {
      const date = new Date(call.createdAt);
      return [
        date.toISOString().split("T")[0],
        date.toTimeString().split(" ")[0],
        call.direction || "",
        call.fromNumber || "",
        call.toNumber || "",
        call.businessName || call.mcaId?.company || "",
        call.mcaId?.uniqueId || "",
        call.agentId?.name || call.agentId?.email || "",
        call.agentExtension || "",
        call.status || "",
        call.durationSeconds || 0,
        call.recordingUrl ? "Yes" : "No",
        call.recordingUrl || "",
        (call.transcription?.text || "").replace(/[\n\r,]/g, " ").substring(0, 500),
        (call.summary?.text || "").replace(/[\n\r,]/g, " ").substring(0, 500),
        call.twilioCallSid || "",
      ];
    });

    // Escape CSV fields
    const escapeCSV = (field) => {
      if (field === null || field === undefined) return "";
      const str = String(field);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // Set headers for file download
    const filename = `calls_export_${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error("Export calls error:", error);
    res.status(500).json({
      success: false,
      message: "Error exporting calls",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Cleanup stale calls
 * POST /api/twilio/calls/cleanup
 * Marks old in-progress/ringing calls as failed
 */
exports.cleanupStaleCalls = async (req, res) => {
  try {
    // Find calls that have been in non-terminal status for more than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Non-terminal statuses that indicate a call might be stuck
    const staleStatuses = [
      "initiated",
      "ringing",
      "in-progress",
      "queued",
    ];

    const staleCalls = await Call.find({
      status: { $in: staleStatuses },
      createdAt: { $lt: oneHourAgo },
    });

    let updatedCount = 0;

    for (const call of staleCalls) {
      call.status = "failed";
      call.metadata = call.metadata || {};
      call.metadata.cleanupReason = "Marked as failed by cleanup job - call was stuck in non-terminal state";
      call.metadata.cleanupAt = new Date();
      call.endTime = call.endTime || new Date();
      await call.save();
      updatedCount++;
      console.log(`Cleaned up stale call ${call.twilioCallSid} (was: ${call.status})`);
    }

    res.json({
      success: true,
      message: `Cleaned up ${updatedCount} stale calls`,
      data: {
        totalFound: staleCalls.length,
        updated: updatedCount,
        cutoffTime: oneHourAgo.toISOString(),
      },
    });
  } catch (error) {
    console.error("Cleanup stale calls error:", error);
    res.status(500).json({
      success: false,
      message: "Error cleaning up stale calls",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Sync call duration from recording duration
 * POST /api/twilio/calls/:callId/sync-duration
 * Updates durationSeconds from recordingDurationSeconds for calls where they don't match
 */
exports.syncCallDuration = async (req, res) => {
  try {
    const { callId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(callId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid call ID format",
      });
    }

    const call = await Call.findById(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    // Check if recording duration exists and is different from call duration
    if (call.recordingDurationSeconds && call.recordingDurationSeconds > 0) {
      const oldDuration = call.durationSeconds || 0;
      call.durationSeconds = call.recordingDurationSeconds;
      await call.save();

      return res.json({
        success: true,
        message: `Duration updated from ${oldDuration}s to ${call.durationSeconds}s`,
        data: {
          oldDuration,
          newDuration: call.durationSeconds,
          recordingDuration: call.recordingDurationSeconds,
        },
      });
    }

    return res.json({
      success: true,
      message: "No recording duration available to sync",
      data: {
        currentDuration: call.durationSeconds,
        recordingDuration: call.recordingDurationSeconds,
      },
    });
  } catch (error) {
    console.error("Sync call duration error:", error);
    res.status(500).json({
      success: false,
      message: "Error syncing call duration",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Handle voicemail webhook
 * POST /api/twilio/voicemail
 * Called when a voicemail is left
 */
exports.handleVoicemail = async (req, res) => {
  try {
    const callSid = req.body?.CallSid;
    const recordingUrl = req.body?.RecordingUrl;
    const recordingSid = req.body?.RecordingSid;
    const recordingDuration = req.body?.RecordingDuration;
    const fromNumber = req.body?.From;
    const toNumber = req.body?.To;

    if (!callSid) {
      console.warn("Voicemail webhook missing CallSid");
      return res.status(200).send("OK");
    }

    // Normalize phone numbers
    const normalizedFrom = fromNumber ? normalizePhoneNumber(fromNumber) : null;
    const normalizedTo = toNumber ? normalizePhoneNumber(toNumber) : null;

    // Update or create call record with voicemail info
    const updateData = {
      status: "voicemail",
      recordingSid: recordingSid || null,
      recordingUrl: recordingUrl || null,
      metadata: {
        voicemailWebhook: {
          CallSid: callSid,
          RecordingSid: recordingSid,
          RecordingUrl: recordingUrl,
          RecordingDuration: recordingDuration,
          From: fromNumber,
          To: toNumber,
        },
      },
    };

    if (recordingDuration && !isNaN(Number(recordingDuration))) {
      updateData.recordingDurationSeconds = Math.floor(Number(recordingDuration));
    }

    let callDoc = await Call.findOne({ twilioCallSid: callSid });

    if (callDoc) {
      Object.assign(callDoc, updateData);
      await callDoc.save();
    } else {
      // Create new record for voicemail
      const newCallData = {
        twilioCallSid: callSid,
        direction: "inbound",
        fromNumber: normalizedFrom || fromNumber || "unknown",
        toNumber: normalizedTo || toNumber || "unknown",
        ...updateData,
      };

      callDoc = new Call(newCallData);
      await attachBusinessContext(callDoc);
      await callDoc.save();
    }

    // Trigger transcription for voicemail if recording available
    if (callDoc && callDoc.recordingUrl) {
      processCallRecording(callDoc).catch((error) => {
        console.error("Voicemail transcription error:", error);
      });
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Voicemail webhook error:", error);
    res.status(200).send("OK");
  }
};

/**
 * Generate voicemail TwiML
 * GET/POST /api/twilio/voicemail-greeting
 * Returns TwiML for voicemail recording
 */
exports.voicemailGreeting = async (req, res) => {
  try {
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();

    const baseUrl = getBaseUrl(req);
    const voicemailCallbackUrl = buildTwiMLUrl(baseUrl, "/voicemail");

    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "We're sorry, no one is available to take your call right now. Please leave a message after the tone, and we will get back to you as soon as possible."
    );

    twiml.record({
      maxLength: 120, // 2 minutes max
      action: voicemailCallbackUrl,
      recordingStatusCallback: voicemailCallbackUrl,
      recordingStatusCallbackMethod: "POST",
      transcribe: false, // We use our own transcription
      playBeep: true,
    });

    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "We did not receive your message. Please try again later."
    );
    twiml.hangup();

    res.type("text/xml");
    res.status(200).send(twiml.toString());
  } catch (error) {
    console.error("Voicemail greeting error:", error);
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const errorTwiml = new VoiceResponse();
    errorTwiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "We're sorry, there was an error. Please try again later."
    );
    errorTwiml.hangup();
    res.type("text/xml").status(200).send(errorTwiml.toString());
  }
};

/**
 * ============================================================================
 * TWILIO INTELLIGENCE ENDPOINTS
 * ============================================================================
 */

const {
  handleTranscriptionWebhook,
  processRecordingWithTwilioIntelligence,
  getTranscript,
  checkConfiguration: checkIntelligenceConfig,
} = require("../services/twilioIntelligenceService");

/**
 * Handle Twilio Intelligence transcription webhook
 * POST /api/twilio/intelligence/transcript-status
 * Called by Twilio when transcription status changes
 */
exports.handleIntelligenceWebhook = async (req, res) => {
  try {
    console.log("Twilio Intelligence webhook received:", JSON.stringify(req.body, null, 2));

    const result = await handleTranscriptionWebhook(req.body);

    if (result) {
      console.log(`Intelligence webhook processed for call: ${result.twilioCallSid}`);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Twilio Intelligence webhook error:", error);
    // Always return 200 to prevent retries
    res.status(200).send("OK");
  }
};

/**
 * Trigger Twilio Intelligence transcription for a call
 * POST /api/twilio/calls/:callId/transcribe-twilio
 * Uses Twilio Intelligence instead of OpenAI Whisper
 */
exports.transcribeWithTwilioIntelligence = async (req, res) => {
  try {
    const { callId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(callId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid call ID format",
      });
    }

    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    if (!call.recordingSid) {
      return res.status(400).json({
        success: false,
        message: "No recording available for this call. Cannot transcribe.",
      });
    }

    // Check if already transcribed with Twilio Intelligence
    if (call.twilioTranscript?.status === "completed") {
      return res.status(200).json({
        success: true,
        message: "Call already transcribed with Twilio Intelligence",
        transcription: call.transcription?.text,
        transcriptSid: call.twilioTranscript.transcriptSid,
      });
    }

    // Check if transcription is already in progress
    if (call.twilioTranscript?.status === "processing") {
      return res.status(200).json({
        success: true,
        message: "Transcription already in progress",
        transcriptSid: call.twilioTranscript.transcriptSid,
      });
    }

    // Trigger transcription
    const result = await processRecordingWithTwilioIntelligence(call);

    if (result.success) {
      res.json({
        success: true,
        message: "Transcription initiated with Twilio Intelligence",
        transcriptSid: result.transcriptSid,
        status: result.status,
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    console.error("Twilio Intelligence transcription error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to start transcription",
    });
  }
};

/**
 * Get Twilio Intelligence transcript for a call
 * GET /api/twilio/calls/:callId/transcript
 */
exports.getTwilioTranscript = async (req, res) => {
  try {
    const { callId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(callId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid call ID format",
      });
    }

    const call = await Call.findById(callId);
    if (!call) {
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    // If no Twilio transcript, return standard transcription
    if (!call.twilioTranscript?.transcriptSid) {
      return res.json({
        success: true,
        source: call.transcription?.source || "openai-whisper",
        status: call.transcription?.status || "pending",
        text: call.transcription?.text || null,
        sentences: null,
      });
    }

    // Fetch latest from Twilio if still processing
    if (call.twilioTranscript.status === "processing") {
      try {
        const transcriptData = await getTranscript(call.twilioTranscript.transcriptSid);

        // Update local record if completed
        if (transcriptData.status === "completed") {
          call.twilioTranscript.status = "completed";
          call.twilioTranscript.completedAt = new Date();
          call.transcription = {
            text: transcriptData.fullText,
            status: "completed",
            processedAt: new Date(),
            source: "twilio-intelligence",
          };
          call.metadata = call.metadata || {};
          call.metadata.twilioTranscriptSentences = transcriptData.sentences;
          await call.save();
        }

        return res.json({
          success: true,
          source: "twilio-intelligence",
          status: transcriptData.status,
          text: transcriptData.fullText,
          sentences: transcriptData.sentences,
          duration: transcriptData.duration,
          transcriptSid: call.twilioTranscript.transcriptSid,
        });
      } catch (fetchError) {
        console.error("Error fetching transcript:", fetchError);
      }
    }

    // Return cached data
    return res.json({
      success: true,
      source: "twilio-intelligence",
      status: call.twilioTranscript.status,
      text: call.transcription?.text || null,
      sentences: call.metadata?.twilioTranscriptSentences || null,
      transcriptSid: call.twilioTranscript.transcriptSid,
    });
  } catch (error) {
    console.error("Get transcript error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get transcript",
    });
  }
};

/**
 * Check Twilio Intelligence configuration status
 * GET /api/twilio/intelligence/status
 */
exports.getIntelligenceStatus = async (req, res) => {
  try {
    const status = await checkIntelligenceConfig();
    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error("Intelligence status check error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to check Intelligence status",
    });
  }
};
