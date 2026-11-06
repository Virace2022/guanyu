export function SignYuba_timeout(attempt = 1) { return Math.min(60000, 10000 * 2 ** Math.min(3, Math.max(0, attempt - 1))); }

function SignYuba_message(result) {
    return String(result.message || result.msg || "").trim().slice(0, 120);
}

function SignYuba_responseError(result, fallback = "接口未说明原因") {
    const codes = [];
    if (result.error != null) codes.push(`error=${String(result.error).slice(0, 24)}`);
    if (result.status_code != null) codes.push(`status_code=${String(result.status_code).slice(0, 24)}`);
    return `${SignYuba_message(result) || fallback}${codes.length ? `（${codes.join("，")}）` : ""}`;
}

export function SignYuba_assertResponse(result) {
    if ((result.error != null && Number(result.error) !== 0) || (result.status_code != null && Number(result.status_code) !== 200)) {
        throw new Error(SignYuba_responseError(result));
    }
}

export function SignYuba_signResult(result) {
    const message = SignYuba_message(result);
    if (/^(?:(?:您|你)(?:今天|今日)?|(?:今天|今日)(?:您|你)?)?(?:已|已经)(?:成功)?签(?:到(?:过)?|过到?)(?:了)?(?:$|[！!。，,；;.])/.test(message) || /^请勿重复签到[！!。.]?$/.test(message)) return "already";
    SignYuba_assertResponse(result);
    const success = result.error != null && Number(result.error) === 0 || result.status_code != null && Number(result.status_code) === 200 || Number(result.data?.count) > 0;
    if (success && (!message || /^签到成功[！!。.]?$/.test(message))) return "signed";
    throw new Error(SignYuba_responseError(result, "接口未确认签到成功"));
}

export function SignYuba_supplementComplete(result) {
    const message = SignYuba_message(result);
    return Number(result.status_code) === 1001
        || /(?:今天|今日).*(?:已|已经).*签到|(?:已|已经)签到|无需补签|无须补签|没有.*(?:补签|漏签)|请勿重复签到/.test(message);
}
