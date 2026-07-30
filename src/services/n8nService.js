// n8n AI Engine & Automation Integration Hub
// Dedicated to future AI capabilities:
// 1) Voice AI POS Assistant (Voice-to-Order)
// 2) Smart Audit & Fraud Detection Workflows
// 3) AI Sales Analytics & Automated Campaigns

const AI_SETTINGS_KEY = 'brushwell_pos_ai_settings';

export const getAISettings = () => {
  const saved = localStorage.getItem(AI_SETTINGS_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  return {
    n8n_ai_endpoint: '',
    voice_assistant_enabled: false,
    smart_audit_enabled: false,
    ai_campaigns_enabled: false
  };
};

export const saveAISettings = (settings) => {
  localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
};

/**
  Future AI Endpoint Trigger (Voice Sales Orders, Smart Audits, AI Campaigns)
 */
export const triggerAIWorkflow = async (workflowType, payload) => {
  const settings = getAISettings();
  if (!settings.n8n_ai_endpoint) {
    console.warn(`[AI Engine] n8n AI endpoint not configured. Skipping ${workflowType}`);
    return { status: 'disabled', message: 'n8n AI endpoint not configured' };
  }

  try {
    const res = await fetch(settings.n8n_ai_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_type: workflowType,
        payload,
        timestamp: new Date().toISOString()
      })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error(`[AI Engine] ${workflowType} error:`, err);
  }

  return { status: 'error', message: 'Failed to trigger n8n AI workflow' };
};
