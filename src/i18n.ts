const STRINGS = {
  "zh-CN": {
    publicationColumn: "期刊标签",
    hashTagsColumn: "#标签",
    statusColumn: "状态",
    remarkColumn: "简记",
    clearStatus: "清除状态",
    editRemark: "编辑简记",
    save: "保存",
    cancel: "取消",
    updatePublication: "更新所选条目的期刊标签",
    deletePublication: "删除所选条目的期刊标签",
    noPublication: "所选条目没有期刊或会议名称。",
    noDeletablePublication: "所选条目没有可删除的期刊标签。",
    confirmDeletePublication: "将删除 {count} 种期刊的全部标签。同名期刊的其他条目也会受到影响。\n\n是否继续？",
    deletePublicationFinished: "期刊标签删除完成：已删除 {deleted} 种期刊，跳过 {skipped} 种无可删除标签的期刊。",
    deletePublicationFailed: "期刊标签删除失败，本次操作未留下部分删除。\n原因：{reason}",
    missingKey: "请先在 Focus Columns 设置中填写 EasyScholar 密钥。",
    updateFinished: "期刊标签更新完成：成功 {success}，无数据 {empty}，失败 {failed}。",
    updateStopped: "期刊标签更新已停止：成功 {success}，无数据 {empty}，失败 {failed}。\n原因：{reason}",
    invalidEndpoint: "EasyScholar 接口地址无效。",
    invalidKey: "EasyScholar 密钥无效（代码 {code}）。",
    rateLimited: "EasyScholar 请求过于频繁，请稍后重试。",
    httpClient: "EasyScholar 请求被拒绝（HTTP {code}）。",
    httpServer: "EasyScholar 服务暂时不可用（HTTP {code}）。",
    requestTimeout: "EasyScholar 请求超时。",
    networkFailure: "无法连接 EasyScholar，请检查网络后重试。",
    invalidResponse: "EasyScholar 返回了无法识别的响应。",
    businessError: "EasyScholar 返回业务错误（代码 {code}）。",
    cacheFailure: "本地期刊标签缓存写入失败。",
    pluginName: "Focus Columns"
  },
  "en-US": {
    publicationColumn: "Publication Tags",
    hashTagsColumn: "# Tags",
    statusColumn: "Status",
    remarkColumn: "Remark",
    clearStatus: "Clear status",
    editRemark: "Edit remark",
    save: "Save",
    cancel: "Cancel",
    updatePublication: "Update publication tags for selected items",
    deletePublication: "Delete publication tags for selected items",
    noPublication: "The selected items have no publication or proceedings title.",
    noDeletablePublication: "The selected items have no publication tags that can be deleted.",
    confirmDeletePublication: "Delete all tags for {count} publications? Other items with the same publication names will also be affected.",
    deletePublicationFinished: "Publication tags deleted: {deleted} publications cleared, {skipped} publications without deletable tags skipped.",
    deletePublicationFailed: "Publication tags could not be deleted. No partial deletion was retained.\nReason: {reason}",
    missingKey: "Enter an EasyScholar key in Focus Columns preferences first.",
    updateFinished: "Publication tags updated: {success} succeeded, {empty} empty, {failed} failed.",
    updateStopped: "Publication tag update stopped: {success} succeeded, {empty} empty, {failed} failed.\nReason: {reason}",
    invalidEndpoint: "The EasyScholar endpoint is invalid.",
    invalidKey: "The EasyScholar key is invalid (code {code}).",
    rateLimited: "EasyScholar is rate-limiting requests. Try again later.",
    httpClient: "EasyScholar rejected the request (HTTP {code}).",
    httpServer: "EasyScholar is temporarily unavailable (HTTP {code}).",
    requestTimeout: "The EasyScholar request timed out.",
    networkFailure: "Could not connect to EasyScholar. Check the network and try again.",
    invalidResponse: "EasyScholar returned an unrecognized response.",
    businessError: "EasyScholar returned a business error (code {code}).",
    cacheFailure: "The local publication-tag cache could not be updated.",
    pluginName: "Focus Columns"
  }
} as const;

type StringKey = keyof typeof STRINGS["en-US"];

function locale(): keyof typeof STRINGS {
  return String(Zotero.locale || "en-US").toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function tr(key: StringKey, values: Record<string, string | number> = {}): string {
  let result: string = STRINGS[locale()][key] || STRINGS["en-US"][key];
  for (const [name, value] of Object.entries(values)) {
    result = result.replaceAll(`{${name}}`, String(value));
  }
  return result;
}
