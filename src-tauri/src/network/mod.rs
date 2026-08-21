use crate::settings::GlobalSettings;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

pub struct GenerationRequest {
    pub request_id: String,
    pub session_id: String,
    pub message_id: String,
    pub messages: Vec<ChatMessage>,
    pub settings: GlobalSettings,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationEvent {
    pub request_id: String,
    pub session_id: String,
    pub message_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_code: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn run_generation(app: AppHandle, request: GenerationRequest) {
    let url = format!("{}/chat/completions", request.settings.base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder().timeout(Duration::from_secs(120)).build();
    let client = match client {
        Ok(client) => client,
        Err(error) => {
            emit_failed(&app, &request, None, error.to_string());
            return;
        }
    };
    let body = json!({
        "model": request.settings.model,
        "messages": request.messages,
        "temperature": request.settings.temperature,
        "max_tokens": request.settings.max_output,
        "stream": request.settings.stream
    });
    let response = client.post(url).bearer_auth(&request.api_key).json(&body).send().await;
    let response = match response {
        Ok(response) => response,
        Err(error) => {
            emit_failed(&app, &request, None, error.to_string());
            return;
        }
    };
    if !response.status().is_success() {
        let status_code = response.status().as_u16();
        let text = response.text().await.unwrap_or_else(|_| "模型服务返回失败".to_string());
        emit_failed(&app, &request, Some(status_code), text);
        return;
    }
    if request.settings.stream {
        consume_sse(&app, &request, response).await;
    } else {
        match response.json::<ChatCompletionResponse>().await {
            Ok(response) => emit_completed(&app, &request, response.first_content()),
            Err(error) => emit_failed(&app, &request, None, error.to_string()),
        }
    }
}

async fn consume_sse(app: &AppHandle, request: &GenerationRequest, response: reqwest::Response) {
    let mut stream = response.bytes_stream();
    let mut pending = String::new();
    while let Some(chunk) = stream.next().await {
        match chunk {
            Ok(chunk) => pending.push_str(&String::from_utf8_lossy(&chunk)),
            Err(error) => {
                emit_failed(app, request, None, error.to_string());
                return;
            }
        }
        let events = drain_sse_events(&mut pending);
        for event in events {
            if event == "[DONE]" {
                emit_completed(app, request, None);
                return;
            }
            match serde_json::from_str::<ChatCompletionResponse>(&event) {
                Ok(chunk) => {
                    if let Some(text) = chunk.first_delta() {
                        emit_delta(app, request, text);
                    }
                }
                Err(error) => {
                    emit_failed(app, request, None, error.to_string());
                    return;
                }
            }
        }
    }
    if !pending.trim().is_empty() {
        for event in parse_sse_frame(&pending) {
            if event != "[DONE]" {
                if let Ok(chunk) = serde_json::from_str::<ChatCompletionResponse>(&event) {
                    if let Some(text) = chunk.first_delta() {
                        emit_delta(app, request, text);
                    }
                }
            }
        }
    }
    emit_completed(app, request, None);
}

/// Removes complete SSE frames and keeps an incomplete final frame for the next TCP chunk.
pub fn drain_sse_events(pending: &mut String) -> Vec<String> {
    let mut events = Vec::new();
    while let Some(index) = pending.find("\n\n") {
        let frame = pending[..index].to_string();
        pending.drain(..index + 2);
        events.extend(parse_sse_frame(&frame));
    }
    events
}

fn parse_sse_frame(frame: &str) -> Vec<String> {
    let data = frame
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(str::trim_start)
        .collect::<Vec<_>>();
    if data.is_empty() { Vec::new() } else { vec![data.join("\n")] }
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    #[serde(default)]
    delta: Delta,
    #[serde(default)]
    message: Delta,
}

#[derive(Default, Deserialize)]
struct Delta {
    content: Option<String>,
}

impl ChatCompletionResponse {
    fn first_delta(&self) -> Option<String> {
        self.choices.first()?.delta.content.clone()
    }

    fn first_content(&self) -> Option<String> {
        self.choices.first()?.message.content.clone()
    }
}

fn emit_delta(app: &AppHandle, request: &GenerationRequest, text: String) {
    let _ = app.emit("generation:delta", event_for(request, Some(text), None, None));
}

fn emit_completed(app: &AppHandle, request: &GenerationRequest, text: Option<String>) {
    let _ = app.emit("generation:completed", event_for(request, text, None, None));
}

fn emit_failed(app: &AppHandle, request: &GenerationRequest, status_code: Option<u16>, error: String) {
    let _ = app.emit("generation:failed", event_for(request, None, status_code, Some(sanitize_error(&error, &request.api_key))));
}

fn event_for(request: &GenerationRequest, text: Option<String>, status_code: Option<u16>, error: Option<String>) -> GenerationEvent {
    GenerationEvent { request_id: request.request_id.clone(), session_id: request.session_id.clone(), message_id: request.message_id.clone(), text, status_code, error }
}

pub fn sanitize_error(error: &str, api_key: &str) -> String {
    error.replace(api_key, "[REDACTED]").replace("Authorization", "认证")
}

#[cfg(test)]
mod tests {
    use super::{drain_sse_events, sanitize_error};

    #[test]
    fn parses_complete_and_split_sse_frames() {
        let mut pending = "data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\n\ndata: [DO".to_string();
        assert_eq!(drain_sse_events(&mut pending).len(), 1);
        assert_eq!(pending, "data: [DO");
        pending.push_str("NE]\n\n");
        assert_eq!(drain_sse_events(&mut pending), vec!["[DONE]"]);
    }

    #[test]
    fn joins_multiline_data_and_redacts_the_key() {
        let mut pending = "event: message\ndata: first\ndata: second\n\n".to_string();
        assert_eq!(drain_sse_events(&mut pending), vec!["first\nsecond"]);
        assert!(!sanitize_error("Authorization: Bearer top-secret", "top-secret").contains("top-secret"));
    }
}
