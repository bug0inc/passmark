"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSecureScript = runSecureScript;
exports.validateScript = validateScript;
const acorn_1 = require("acorn");
const promises_1 = require("node:dns/promises");
const logger_1 = require("../logger");
const index_1 = require("./index");
// =============================================================================
// ALLOWED METHODS CONFIGURATION
// =============================================================================
/**
 * Methods that can be called directly on `page` to start a locator chain.
 */
const ALLOWED_START_METHODS = new Set([
    // Locator methods
    "locator",
    "getByRole",
    "getByText",
    "getByLabel",
    "getByPlaceholder",
    "getByTestId",
    "getByAltText",
    "getByTitle",
    // Frame methods
    "frameLocator",
]);
/**
 * Assertion methods that can be called on expect(locator).
 */
const ALLOWED_EXPECT_ASSERTION_METHODS = new Set([
    // Text assertions
    "toContainText",
    "toHaveText",
    // Visibility assertions
    "toBeVisible",
    "toBeHidden",
    // State assertions
    "toBeEnabled",
    "toBeDisabled",
    "toBeChecked",
    "toBeEditable",
    "toBeEmpty",
    "toBeFocused",
    // Attribute assertions
    "toHaveAttribute",
    "toHaveClass",
    "toHaveCSS",
    "toHaveId",
    // Value assertions
    "toHaveValue",
    "toHaveValues",
    // Count assertions
    "toHaveCount",
    // Screenshot assertions
    "toHaveScreenshot",
    // Attached assertions
    "toBeAttached",
    // Role assertions
    "toHaveRole",
    // Accessible name/description
    "toHaveAccessibleName",
    "toHaveAccessibleDescription",
    // Generic assertions
    "toBe",
    "toEqual",
    "toBeTruthy",
    "toBeFalsy",
    "toBeNull",
    "toBeUndefined",
    "toBeDefined",
    "toBeNaN",
    "toContain",
    "toMatch",
    "toHaveLength",
]);
/**
 * Methods that can be chained on a locator to refine selection.
 * Note: `and` and `or` are excluded because they require locator arguments,
 * which cannot be created as literals in the current implementation.
 */
const ALLOWED_LOCATOR_CHAIN_METHODS = new Set([
    "first",
    "last",
    "nth",
    "filter", // Note: `has`/`hasNot` options won't work (require locators), but `hasText`/`hasNotText` work
    "locator",
    "getByRole",
    "getByText",
    "getByLabel",
    "getByPlaceholder",
    "getByTestId",
    "getByAltText",
    "getByTitle",
]);
/**
 * Action methods that perform interactions (must be last in chain).
 * Note: `dragTo` is excluded because it requires a locator argument,
 * which cannot be created as a literal in the current implementation.
 */
const ALLOWED_ACTION_METHODS = new Set([
    "click",
    "dblclick",
    "fill",
    "type",
    "press",
    "check",
    "uncheck",
    "hover",
    "focus",
    "blur",
    "selectOption",
    "clear",
    "scrollIntoViewIfNeeded",
    "waitFor",
    "isVisible",
    "isEnabled",
    "isChecked",
    "textContent",
    "innerText",
    "innerHTML",
    "getAttribute",
    "inputValue",
    "count",
]);
/**
 * Methods that can be called directly on `page` (not locator chains).
 * These are page-level operations like navigation, waits, etc.
 * Note: `waitForFunction` is excluded because it requires a function argument,
 * which cannot be created as a literal in the current implementation.
 */
const ALLOWED_PAGE_METHODS = new Set([
    // Navigation
    "goto",
    "reload",
    "goBack",
    "goForward",
    // Waits
    "waitForLoadState",
    "waitForURL",
    "waitForTimeout",
    "waitForSelector",
    // Page state
    "title",
    "url",
    "content",
    // Screenshots
    "screenshot",
    // Other
    "close",
    "bringToFront",
    "setViewportSize",
]);
/**
 * Methods that can be called on page.keyboard
 */
const ALLOWED_KEYBOARD_METHODS = new Set(["press", "type", "down", "up", "insertText"]);
/**
 * Methods that can be called on page.mouse
 */
const ALLOWED_MOUSE_METHODS = new Set(["click", "dblclick", "down", "up", "move", "wheel"]);
/**
 * Methods that can be called on context (BrowserContext).
 * Accessed via page.context() internally.
 */
const ALLOWED_CONTEXT_METHODS = new Set([
    // Cookies
    "cookies",
    "addCookies",
    "clearCookies",
    // Storage
    "storageState",
    // Permissions
    "clearPermissions",
    // Geolocation
    "setGeolocation",
    // Other
    "setOffline",
    "waitForEvent",
]);
/**
 * Methods that can be called on browser.
 * Accessed via page.context().browser() internally.
 */
const ALLOWED_BROWSER_METHODS = new Set(["isConnected", "version"]);
/**
 * Methods that can be called on console for logging.
 */
const ALLOWED_CONSOLE_METHODS = new Set(["log"]);
/**
 * Methods that can be called on Response objects from fetch.
 */
const ALLOWED_RESPONSE_METHODS = new Set(["json", "text", "arrayBuffer", "blob"]);
/**
 * HTTP methods allowed in fetch requests.
 */
const ALLOWED_FETCH_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
/**
 * Hosts that are blocked for fetch requests (localhost/loopback).
 */
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);
/**
 * Reserved variable names that cannot be used in user scripts.
 */
const RESERVED_VARIABLE_NAMES = new Set([
    "page",
    "context",
    "browser",
    "console",
    "expect",
    "process",
    "require",
    "import",
    "fetch",
    "eval",
    "Function",
]);
/**
 * Constructors allowed in computed expressions.
 * Only safe, side-effect-free constructors are permitted.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ALLOWED_CONSTRUCTORS = new Map([["URL", URL]]);
/**
 * Properties/methods allowed per computed type.
 * Maps constructor name → Set of allowed property/method names.
 */
const ALLOWED_COMPUTED_PROPERTIES = new Map([
    ["URL", new Set(["searchParams"])],
    ["URLSearchParams", new Set(["toString"])],
]);
/**
 * Binary operators allowed in computed expressions.
 */
const ALLOWED_BINARY_OPERATORS = new Set(["+"]);
/**
 * Getter methods that should auto-log their return values.
 * These are read-only methods that return data without side effects.
 */
const GETTER_METHODS = new Set([
    // Browser getters
    "version",
    "isConnected",
    // Context getters
    "cookies",
    "storageState",
    // Page getters
    "title",
    "url",
    "content",
    // Locator getters
    "textContent",
    "innerText",
    "innerHTML",
    "getAttribute",
    "inputValue",
    "count",
    "isVisible",
    "isEnabled",
    "isChecked",
]);
// =============================================================================
// ASSERTION HELPER
// =============================================================================
function assert(condition, message) {
    if (!condition) {
        throw new Error(`[SecureScriptRunner] ${message}`);
    }
}
// =============================================================================
// URL VALIDATION FOR FETCH
// =============================================================================
/**
 * Check if a hostname is blocked (localhost, loopback, private IPs).
 */
function isBlockedHost(hostname) {
    const lower = hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(lower))
        return true;
    // Block 127.x.x.x range
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower))
        return true;
    // Block private IP ranges
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lower))
        return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(lower))
        return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(lower))
        return true;
    return false;
}
/**
 * Validate a URL for fetch requests.
 * Only allows http/https and blocks localhost/private IPs.
 */
function validateFetchUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new Error(`[SecureScriptRunner] Invalid URL: "${url}"`);
    }
    // Only allow http and https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`[SecureScriptRunner] URL must use http or https protocol, got: ${parsed.protocol}`);
    }
    // Block localhost and private IPs
    if (isBlockedHost(parsed.hostname)) {
        throw new Error(`[SecureScriptRunner] Blocked URL: cannot fetch from ${parsed.hostname}`);
    }
}
/**
 * Validate that a URL's hostname does not resolve to a blocked IP address.
 * Prevents DNS rebinding attacks where a domain initially passes hostname
 * validation but resolves to a private/loopback IP at connection time.
 */
async function validateFetchUrlResolution(url) {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
    // Skip if the hostname is already an IP literal (already checked by isBlockedHost)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) || hostname.includes(":")) {
        return;
    }
    try {
        const { address } = await (0, promises_1.lookup)(hostname);
        if (isBlockedHost(address)) {
            throw new Error(`[SecureScriptRunner] DNS rebinding blocked: ${hostname} resolves to ${address}`);
        }
    }
    catch (err) {
        if (err instanceof Error && err.message.includes("DNS rebinding blocked")) {
            throw err;
        }
        // DNS resolution failure — let fetch handle it naturally
    }
}
/**
 * Validate fetch options object.
 */
function validateFetchOptions(options) {
    if (options === undefined || options === null)
        return;
    assert(typeof options === "object" && !Array.isArray(options), "fetch options must be an object");
    const opts = options;
    // Validate method
    if (opts.method !== undefined) {
        assert(typeof opts.method === "string", "method must be a string");
        const method = opts.method.toUpperCase();
        assert(ALLOWED_FETCH_METHODS.has(method), `Invalid method: ${opts.method}. Allowed: ${[...ALLOWED_FETCH_METHODS].join(", ")}`);
    }
    // Validate headers
    if (opts.headers !== undefined) {
        assert(typeof opts.headers === "object" && !Array.isArray(opts.headers), "headers must be an object");
        for (const [key, value] of Object.entries(opts.headers)) {
            assert(typeof value === "string", `header "${key}" value must be a string`);
        }
    }
    // Validate body (string for JSON, or will auto-serialize objects)
    if (opts.body !== undefined) {
        assert(typeof opts.body === "string" || (typeof opts.body === "object" && opts.body !== null), "body must be a string or object");
    }
}
// =============================================================================
// AST NODE TO STRING (for error messages)
// =============================================================================
/**
 * Convert an AST node to a readable string representation for error messages.
 * This helps users understand what code caused the error.
 */
function nodeToString(node) {
    switch (node.type) {
        case "Identifier":
            return node.name;
        case "MemberExpression": {
            const member = node;
            const obj = nodeToString(member.object);
            const prop = member.property.type === "Identifier"
                ? member.property.name
                : nodeToString(member.property);
            return member.computed ? `${obj}[${prop}]` : `${obj}.${prop}`;
        }
        case "CallExpression": {
            const call = node;
            const callee = nodeToString(call.callee);
            return `${callee}(...)`;
        }
        case "NewExpression": {
            const newExpr = node;
            const callee = nodeToString(newExpr.callee);
            return `new ${callee}(...)`;
        }
        case "Literal": {
            const literal = node;
            if (literal.regex) {
                return `/${literal.regex.pattern}/${literal.regex.flags}`;
            }
            return JSON.stringify(literal.value);
        }
        case "ArrayExpression":
            return "[...]";
        case "ObjectExpression":
            return "{...}";
        case "ArrowFunctionExpression":
        case "FunctionExpression":
            return "() => {...}";
        case "TemplateLiteral":
            return "`...`";
        case "UnaryExpression": {
            const unary = node;
            return `${unary.operator}${nodeToString(unary.argument)}`;
        }
        case "BinaryExpression": {
            const binary = node;
            return `${nodeToString(binary.left)} ${binary.operator} ${nodeToString(binary.right)}`;
        }
        default:
            return `[${node.type}]`;
    }
}
// =============================================================================
// SAFE LITERAL EVALUATION
// =============================================================================
/**
 * Only allow JSON-like literal values (string/number/boolean/null/regex/arrays/objects).
 * No identifiers, function calls, template literals with expressions, etc.
 */
function evalSafeLiteral(node) {
    switch (node.type) {
        case "Literal": {
            const literal = node;
            // acorn uses Literal for string/number/bool/null and also RegExp in node.regex
            if (literal.regex) {
                return new RegExp(literal.regex.pattern, literal.regex.flags);
            }
            return literal.value;
        }
        case "ArrayExpression": {
            const arr = node;
            return arr.elements.map((el) => {
                assert(el !== null, "Sparse arrays are not allowed");
                return evalSafeLiteral(el);
            });
        }
        case "ObjectExpression": {
            const obj = node;
            const out = {};
            for (const prop of obj.properties) {
                assert(prop.type === "Property", "Only plain object properties allowed");
                assert(prop.kind === "init", "Only init properties allowed");
                assert(prop.computed === false, "Computed keys not allowed");
                let key = null;
                if (prop.key.type === "Identifier") {
                    key = prop.key.name;
                }
                else if (prop.key.type === "Literal") {
                    const keyValue = prop.key.value;
                    if (typeof keyValue === "string") {
                        key = keyValue;
                    }
                }
                assert(typeof key === "string", "Object keys must be string or identifier");
                out[key] = evalSafeLiteral(prop.value);
            }
            return out;
        }
        case "UnaryExpression": {
            // Handle negative numbers like -1
            const unary = node;
            if (unary.operator === "-" && unary.argument.type === "Literal") {
                const literal = unary.argument;
                if (typeof literal.value === "number") {
                    return -literal.value;
                }
            }
            throw new Error(`Unsupported unary expression: "${nodeToString(node)}". Only negative numbers like -1 are allowed.`);
        }
        case "TemplateLiteral": {
            // Handle simple template literals without expressions (e.g., `hello`)
            const template = node;
            if (template.expressions.length > 0) {
                throw new Error(`Template literals with expressions are not allowed: "${nodeToString(node)}". Use regular string literals instead.`);
            }
            // Concatenate all quasi values (for simple templates, there's just one)
            return template.quasis.map((q) => q.value.cooked ?? q.value.raw).join("");
        }
        default:
            throw new Error(`Unsupported argument: "${nodeToString(node)}" (${node.type}). Only literals, arrays, and objects are allowed.`);
    }
}
/**
 * Check if a node is a literal value that can be safely evaluated.
 * This includes: Literal, ArrayExpression, ObjectExpression, TemplateLiteral (without expressions),
 * and UnaryExpression (for negative numbers like -1).
 */
function isLiteralNode(node) {
    switch (node.type) {
        case "Literal":
            return true;
        case "ArrayExpression": {
            const arr = node;
            return arr.elements.every((el) => el !== null && isLiteralNode(el));
        }
        case "ObjectExpression": {
            const obj = node;
            return obj.properties.every((prop) => prop.type === "Property" &&
                prop.kind === "init" &&
                !prop.computed &&
                isLiteralNode(prop.value));
        }
        case "TemplateLiteral": {
            const template = node;
            return template.expressions.length === 0;
        }
        case "UnaryExpression": {
            const unary = node;
            return unary.operator === "-" && unary.argument.type === "Literal";
        }
        default:
            return false;
    }
}
/**
 * Evaluate a node as a safe value, allowing variable references in addition to literals.
 * Used for method arguments where variables should be allowed (e.g., page.goto(data.result)).
 */
function evalSafeValue(node, variables) {
    if (variables) {
        const chain = tryParseValueChain(node, variables);
        if (chain) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let value = variables.get(chain.variableName);
            for (const prop of chain.propertyPath) {
                if (value === null || value === undefined) {
                    throw new Error(`Cannot read property "${prop}" of ${value} on variable "${chain.variableName}"`);
                }
                value = value[prop];
            }
            return value;
        }
        // Try computed expressions (e.g., "prefix" + variable, new URL(...))
        const computed = parseSafeExpression(node, variables);
        if (computed && computed.kind !== "literal") {
            return evalSafeExpression(computed, variables);
        }
    }
    return evalSafeLiteral(node);
}
// =============================================================================
// COMPUTED EXPRESSION PARSING & EVALUATION
// =============================================================================
const BLOCKED_PROPERTIES = new Set(["constructor", "__proto__", "prototype"]);
/**
 * Parse an AST node into a safe computed expression tree.
 * Returns null if the node doesn't match any computed expression pattern,
 * allowing fallback to the existing parseAllowedChain.
 */
function parseSafeExpression(node, variables) {
    // Literals
    if (isLiteralNode(node)) {
        return { kind: "literal", value: evalSafeLiteral(node) };
    }
    // Variable references (identifiers and member expressions on known variables)
    if (variables) {
        const chain = tryParseValueChain(node, variables);
        if (chain) {
            return {
                kind: "variableRef",
                variableName: chain.variableName,
                propertyPath: chain.propertyPath,
            };
        }
    }
    // new Constructor(args) — e.g., new URL(expr)
    if (node.type === "NewExpression") {
        const newExpr = node;
        if (newExpr.callee.type !== "Identifier")
            return null;
        const ctorName = newExpr.callee.name;
        if (!ALLOWED_CONSTRUCTORS.has(ctorName))
            return null;
        const args = [];
        for (const arg of newExpr.arguments) {
            const parsed = parseSafeExpression(arg, variables);
            if (!parsed)
                return null;
            args.push(parsed);
        }
        return { kind: "newExpression", constructorName: ctorName, args };
    }
    // Method call: expr.method(args) — e.g., searchParams.toString()
    if (node.type === "CallExpression") {
        const call = node;
        if (call.callee.type === "MemberExpression") {
            const member = call.callee;
            if (member.computed)
                return null;
            if (member.property.type !== "Identifier")
                return null;
            const methodName = member.property.name;
            if (BLOCKED_PROPERTIES.has(methodName))
                return null;
            // If the object is a variable holding a Response, bail out so
            // parseAllowedChain → executeChain handles it (which properly awaits
            // async methods like .json() / .text()).
            if (member.object.type === "Identifier" &&
                variables?.has(member.object.name) &&
                variables.get(member.object.name) instanceof Response) {
                return null;
            }
            const objExpr = parseSafeExpression(member.object, variables);
            if (!objExpr)
                return null;
            const args = [];
            for (const arg of call.arguments) {
                const parsed = parseSafeExpression(arg, variables);
                if (!parsed)
                    return null;
                args.push(parsed);
            }
            return { kind: "methodCall", object: objExpr, method: methodName, args };
        }
        return null;
    }
    // Property access: expr.prop — e.g., url.searchParams
    if (node.type === "MemberExpression") {
        const member = node;
        if (member.computed)
            return null;
        if (member.property.type !== "Identifier")
            return null;
        const propName = member.property.name;
        if (BLOCKED_PROPERTIES.has(propName))
            return null;
        const objExpr = parseSafeExpression(member.object, variables);
        if (!objExpr)
            return null;
        return { kind: "propertyAccess", object: objExpr, property: propName };
    }
    // Binary expression: left + right
    if (node.type === "BinaryExpression") {
        const bin = node;
        if (!ALLOWED_BINARY_OPERATORS.has(bin.operator))
            return null;
        const left = parseSafeExpression(bin.left, variables);
        if (!left)
            return null;
        const right = parseSafeExpression(bin.right, variables);
        if (!right)
            return null;
        return { kind: "binaryExpression", operator: bin.operator, left, right };
    }
    return null;
}
/**
 * Validate that a property/method access on a computed value is allowed.
 * Enforces type-specific allowlists at runtime.
 */
function validateComputedAccess(obj, propOrMethod) {
    if (BLOCKED_PROPERTIES.has(propOrMethod)) {
        throw new Error(`[SecureScriptRunner] Access to "${propOrMethod}" is blocked on computed values`);
    }
    if (obj instanceof URL) {
        const allowed = ALLOWED_COMPUTED_PROPERTIES.get("URL");
        if (!allowed || !allowed.has(propOrMethod)) {
            throw new Error(`[SecureScriptRunner] Property/method "${propOrMethod}" is not allowed on URL objects. Allowed: ${[...(allowed ?? [])].join(", ")}`);
        }
        return;
    }
    if (obj instanceof URLSearchParams) {
        const allowed = ALLOWED_COMPUTED_PROPERTIES.get("URLSearchParams");
        if (!allowed || !allowed.has(propOrMethod)) {
            throw new Error(`[SecureScriptRunner] Property/method "${propOrMethod}" is not allowed on URLSearchParams objects. Allowed: ${[...(allowed ?? [])].join(", ")}`);
        }
        return;
    }
    // Allow property access on plain objects (e.g. JSON response data)
    if (obj !== null &&
        obj !== undefined &&
        typeof obj === "object" &&
        Object.getPrototypeOf(obj) === Object.prototype) {
        return;
    }
    throw new Error(`[SecureScriptRunner] Computed property/method access is not allowed on objects of this type`);
}
/**
 * Evaluate a parsed safe expression tree at runtime.
 */
function evalSafeExpression(expr, variables) {
    switch (expr.kind) {
        case "literal":
            return expr.value;
        case "variableRef": {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let value = variables.get(expr.variableName);
            if (value === undefined && !variables.has(expr.variableName)) {
                throw new Error(`[SecureScriptRunner] Variable "${expr.variableName}" is not defined`);
            }
            for (const prop of expr.propertyPath) {
                if (value === null || value === undefined) {
                    throw new Error(`[SecureScriptRunner] Cannot read property "${prop}" of ${value} on variable "${expr.variableName}"`);
                }
                value = value[prop];
            }
            return value;
        }
        case "newExpression": {
            const Ctor = ALLOWED_CONSTRUCTORS.get(expr.constructorName);
            if (!Ctor) {
                throw new Error(`[SecureScriptRunner] Constructor "${expr.constructorName}" is not allowed`);
            }
            const args = expr.args.map((a) => evalSafeExpression(a, variables));
            return new Ctor(...args);
        }
        case "propertyAccess": {
            const obj = evalSafeExpression(expr.object, variables);
            validateComputedAccess(obj, expr.property);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return obj[expr.property];
        }
        case "methodCall": {
            const obj = evalSafeExpression(expr.object, variables);
            validateComputedAccess(obj, expr.method);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fn = obj[expr.method];
            if (typeof fn !== "function") {
                throw new Error(`[SecureScriptRunner] "${expr.method}" is not a function`);
            }
            const args = expr.args.map((a) => evalSafeExpression(a, variables));
            return fn.call(obj, ...args);
        }
        case "binaryExpression": {
            const left = evalSafeExpression(expr.left, variables);
            const right = evalSafeExpression(expr.right, variables);
            if (expr.operator === "+") {
                if (typeof left !== "string" && typeof right !== "string") {
                    throw new Error(`[SecureScriptRunner] The "+" operator requires at least one string operand`);
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return left + right;
            }
            throw new Error(`[SecureScriptRunner] Operator "${expr.operator}" is not allowed`);
        }
        default: {
            const _exhaustive = expr;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            throw new Error(`[SecureScriptRunner] Unknown expression kind: ${_exhaustive.kind}`);
        }
    }
}
// =============================================================================
// CHAIN PARSING
// =============================================================================
/**
 * Parse a locator chain starting from page, e.g., "page.getByRole(...).first()"
 * Returns the parsed steps.
 */
function parseLocatorChain(node) {
    const steps = [];
    let current = node;
    while (current && current.type === "CallExpression") {
        const call = current;
        const callee = call.callee;
        if (callee.type !== "MemberExpression") {
            break; // Not a method call, stop
        }
        const member = callee;
        assert(member.computed === false, "Computed property access is not allowed");
        const prop = member.property;
        assert(prop.type === "Identifier", "Method name must be an identifier");
        const method = prop.name;
        // Arguments must be safe literals
        const args = call.arguments.map((a) => evalSafeLiteral(a));
        steps.push({ method, args });
        // Move inward: next is the object you're calling the method on
        current = member.object;
    }
    // Now current should be Identifier("page")
    assert(current !== null && current.type === "Identifier", "Locator chain must start from `page`");
    assert(current.name === "page", `Locator chain must start from 'page', got '${current.name}'`);
    // We collected from outermost to innermost; reverse to execute in order
    steps.reverse();
    return steps;
}
/**
 * Check if a node is an identifier with a specific name
 */
function isIdentifier(node, name) {
    return node.type === "Identifier" && node.name === name;
}
/**
 * Check if a node is a member expression like `page.keyboard` or `page.mouse`
 */
function isPageSubObject(node, subObject) {
    if (node.type !== "MemberExpression")
        return false;
    const member = node;
    return isIdentifier(member.object, "page") && isIdentifier(member.property, subObject);
}
/**
 * Parse "page.getByRole(...).click()", "page.goto(...)", "page.keyboard.press(...)",
 * "fetch(...)", "variable.json()", or "expect(page.getByRole(...)).toContainText(...)"
 * Returns the appropriate ParsedChain type.
 */
function parseAllowedChain(exprNode, variables) {
    // Expression must be a call at the top-level (so you can actually do something)
    assert(exprNode.type === "CallExpression", "Top-level must be a function call");
    const topCall = exprNode;
    // Check for expect() patterns (including negated and value-based)
    const expectResult = tryParseExpectChain(topCall, variables);
    if (expectResult)
        return expectResult;
    // Check for page.keyboard.xxx() pattern
    const keyboardResult = tryParseKeyboardChain(topCall);
    if (keyboardResult)
        return keyboardResult;
    // Check for page.mouse.xxx() pattern
    const mouseResult = tryParseMouseChain(topCall);
    if (mouseResult)
        return mouseResult;
    // Check for page.method() pattern (page-level methods like goto, reload)
    const pageMethodResult = tryParsePageMethodChain(topCall, variables);
    if (pageMethodResult)
        return pageMethodResult;
    // Check for context.xxx() pattern
    const contextResult = tryParseContextChain(topCall);
    if (contextResult)
        return contextResult;
    // Check for browser.xxx() pattern
    const browserResult = tryParseBrowserChain(topCall);
    if (browserResult)
        return browserResult;
    // Check for console.xxx() pattern
    const consoleResult = tryParseConsoleChain(topCall, variables);
    if (consoleResult)
        return consoleResult;
    // Check for fetch() pattern
    const fetchResult = tryParseFetchChain(topCall);
    if (fetchResult)
        return fetchResult;
    // Check for response method pattern (variable.json(), variable.text())
    if (variables) {
        const responseMethodResult = tryParseResponseMethodChain(topCall, variables);
        if (responseMethodResult)
            return responseMethodResult;
    }
    // Default: parse as locator chain (page.getByRole().click())
    const steps = parseLocatorChain(exprNode);
    validateLocatorChainSteps(steps);
    return {
        type: "locator",
        steps,
    };
}
/**
 * Try to parse an expect() chain, including negated assertions.
 * Patterns:
 *   - expect(locator).toBeVisible()
 *   - expect(locator).not.toBeVisible()
 *   - expect(variable).toBe(value)
 *   - expect(variable.property).toBe(value)
 */
function tryParseExpectChain(topCall, variables) {
    if (topCall.callee.type !== "MemberExpression")
        return null;
    const topMember = topCall.callee;
    let expectCall = null;
    let assertionMethod = "";
    let negated = false;
    // Check for negated pattern: expect(locator).not.toBeVisible()
    // Structure: CallExpr { callee: MemberExpr { object: MemberExpr { object: CallExpr(expect), property: "not" }, property: "toBeVisible" } }
    if (topMember.object.type === "MemberExpression" &&
        isIdentifier(topMember.object.property, "not")) {
        const notMember = topMember.object;
        if (notMember.object.type === "CallExpression" &&
            notMember.object.callee.type === "Identifier" &&
            isIdentifier(notMember.object.callee, "expect")) {
            expectCall = notMember.object;
            negated = true;
            assert(topMember.property.type === "Identifier", "Assertion method must be an identifier");
            assertionMethod = topMember.property.name;
        }
    }
    // Check for regular pattern: expect(locator).toBeVisible()
    if (!expectCall &&
        topMember.object.type === "CallExpression" &&
        topMember.object.callee.type === "Identifier" &&
        isIdentifier(topMember.object.callee, "expect")) {
        expectCall = topMember.object;
        assert(topMember.property.type === "Identifier", "Assertion method must be an identifier");
        assertionMethod = topMember.property.name;
    }
    if (!expectCall)
        return null;
    // Validate assertion method
    assert(ALLOWED_EXPECT_ASSERTION_METHODS.has(assertionMethod), `Disallowed assertion method: ${assertionMethod}. Allowed: ${[...ALLOWED_EXPECT_ASSERTION_METHODS].join(", ")}`);
    // Get assertion arguments
    const assertionArgs = topCall.arguments.map((a) => evalSafeLiteral(a));
    // Parse the argument inside expect()
    assert(expectCall.arguments.length === 1, "expect() must have exactly one argument");
    const expectArg = expectCall.arguments[0];
    // Check if the argument is a variable reference (possibly with property access)
    // e.g., expect(data) or expect(data.url) or expect(response.status)
    const valueChain = tryParseValueChain(expectArg, variables);
    if (valueChain) {
        return {
            type: "expectValue",
            variableName: valueChain.variableName,
            propertyPath: valueChain.propertyPath,
            assertionMethod: assertionMethod,
            assertionArgs,
            negated,
        };
    }
    // Check if the argument is a literal value (string, number, boolean, etc.)
    // e.g., expect("some string").toBe("expected") or expect(42).toBe(42)
    if (isLiteralNode(expectArg)) {
        const literalValue = evalSafeLiteral(expectArg);
        return {
            type: "expectLiteral",
            literalValue,
            assertionMethod: assertionMethod,
            assertionArgs,
            negated,
        };
    }
    // Otherwise, try to parse as a locator chain (page.getByRole(), etc.)
    const locatorSteps = parseLocatorChain(expectArg);
    validateLocatorSteps(locatorSteps);
    return {
        type: "expect",
        locatorSteps,
        assertionMethod: assertionMethod,
        assertionArgs,
        negated,
    };
}
/**
 * Try to parse a value chain like `data` or `data.url` or `data.nested.property`
 * Returns the variable name and property path if it's a valid variable reference.
 */
function tryParseValueChain(node, variables) {
    // Simple identifier: expect(data)
    if (node.type === "Identifier") {
        const name = node.name;
        // Only match if it's a known variable (not page, context, etc.)
        if (variables && variables.has(name)) {
            return { variableName: name, propertyPath: [] };
        }
        return null;
    }
    // Member expression: expect(data.url) or expect(data.nested.property)
    if (node.type === "MemberExpression") {
        const propertyPath = [];
        // Walk up the member chain to get all properties
        let current = node;
        while (current.type === "MemberExpression") {
            const mem = current;
            assert(mem.property.type === "Identifier", "Property access must be an identifier");
            assert(!mem.computed, "Computed property access not allowed");
            propertyPath.unshift(mem.property.name);
            current = mem.object;
        }
        // The base should be an identifier (the variable name)
        if (current.type === "Identifier") {
            const name = current.name;
            // Only match if it's a known variable
            if (variables && variables.has(name)) {
                return { variableName: name, propertyPath };
            }
        }
    }
    return null;
}
/**
 * Try to parse page.keyboard.xxx() pattern
 */
function tryParseKeyboardChain(topCall) {
    if (topCall.callee.type !== "MemberExpression")
        return null;
    const member = topCall.callee;
    if (!isPageSubObject(member.object, "keyboard"))
        return null;
    assert(member.property.type === "Identifier", "Keyboard method must be an identifier");
    const method = member.property.name;
    assert(ALLOWED_KEYBOARD_METHODS.has(method), `Disallowed keyboard method: ${method}. Allowed: ${[...ALLOWED_KEYBOARD_METHODS].join(", ")}`);
    const args = topCall.arguments.map((a) => evalSafeLiteral(a));
    return {
        type: "keyboard",
        method,
        args,
    };
}
/**
 * Try to parse page.mouse.xxx() pattern
 */
function tryParseMouseChain(topCall) {
    if (topCall.callee.type !== "MemberExpression")
        return null;
    const member = topCall.callee;
    if (!isPageSubObject(member.object, "mouse"))
        return null;
    assert(member.property.type === "Identifier", "Mouse method must be an identifier");
    const method = member.property.name;
    assert(ALLOWED_MOUSE_METHODS.has(method), `Disallowed mouse method: ${method}. Allowed: ${[...ALLOWED_MOUSE_METHODS].join(", ")}`);
    const args = topCall.arguments.map((a) => evalSafeLiteral(a));
    return {
        type: "mouse",
        method,
        args,
    };
}
/**
 * Try to parse page.method() pattern (page-level methods like goto, reload)
 */
function tryParsePageMethodChain(topCall, variables) {
    if (topCall.callee.type !== "MemberExpression")
        return null;
    const member = topCall.callee;
    // Check if it's page.methodName() where methodName is in ALLOWED_PAGE_METHODS
    if (!isIdentifier(member.object, "page"))
        return null;
    assert(member.property.type === "Identifier", "Page method must be an identifier");
    const method = member.property.name;
    // Only match if it's a page-level method, not a locator start method
    if (!ALLOWED_PAGE_METHODS.has(method))
        return null;
    const args = topCall.arguments.map((a) => evalSafeValue(a, variables));
    return {
        type: "pageMethod",
        method,
        args,
    };
}
/**
 * Try to parse context.xxx() pattern
 * Executed as page.context().xxx() internally
 */
function tryParseContextChain(topCall) {
    if (topCall.callee.type !== "MemberExpression")
        return null;
    const member = topCall.callee;
    // Check if it's context.methodName()
    if (!isIdentifier(member.object, "context"))
        return null;
    assert(member.property.type === "Identifier", "Context method must be an identifier");
    const method = member.property.name;
    assert(ALLOWED_CONTEXT_METHODS.has(method), `Disallowed context method: ${method}. Allowed: ${[...ALLOWED_CONTEXT_METHODS].join(", ")}`);
    const args = topCall.arguments.map((a) => evalSafeLiteral(a));
    return {
        type: "context",
        method,
        args,
    };
}
/**
 * Try to parse browser.xxx() pattern
 * Executed as page.context().browser()?.xxx() internally
 */
function tryParseBrowserChain(topCall) {
    if (topCall.callee.type !== "MemberExpression")
        return null;
    const member = topCall.callee;
    // Check if it's browser.methodName()
    if (!isIdentifier(member.object, "browser"))
        return null;
    assert(member.property.type === "Identifier", "Browser method must be an identifier");
    const method = member.property.name;
    assert(ALLOWED_BROWSER_METHODS.has(method), `Disallowed browser method: ${method}. Allowed: ${[...ALLOWED_BROWSER_METHODS].join(", ")}`);
    const args = topCall.arguments.map((a) => evalSafeLiteral(a));
    return {
        type: "browser",
        method,
        args,
    };
}
/**
 * Try to parse console.xxx() pattern
 * Supports console.log, console.warn, console.error, console.info, console.debug
 */
function tryParseConsoleChain(topCall, variables) {
    if (topCall.callee.type !== "MemberExpression")
        return null;
    const member = topCall.callee;
    // Check if it's console.methodName()
    if (!isIdentifier(member.object, "console"))
        return null;
    assert(member.property.type === "Identifier", "Console method must be an identifier");
    const method = member.property.name;
    assert(ALLOWED_CONSOLE_METHODS.has(method), `Disallowed console method: ${method}. Allowed: ${[...ALLOWED_CONSOLE_METHODS].join(", ")}`);
    // Arguments can be safe literals or variable references
    const args = topCall.arguments.map((a) => evalSafeValue(a, variables));
    return {
        type: "console",
        method,
        args,
    };
}
/**
 * Try to parse fetch(url, options?) pattern.
 */
function tryParseFetchChain(topCall) {
    // Check if it's fetch(url, options?)
    if (topCall.callee.type !== "Identifier")
        return null;
    if (topCall.callee.name !== "fetch")
        return null;
    assert(topCall.arguments.length >= 1 && topCall.arguments.length <= 2, "fetch() requires 1-2 arguments: fetch(url, options?)");
    // Extract URL
    const urlArg = evalSafeLiteral(topCall.arguments[0]);
    assert(typeof urlArg === "string", "fetch URL must be a string");
    // Validate URL security
    validateFetchUrl(urlArg);
    // Extract options if present
    let options;
    if (topCall.arguments.length === 2) {
        const optArg = evalSafeLiteral(topCall.arguments[1]);
        validateFetchOptions(optArg);
        options = optArg;
    }
    return {
        type: "fetch",
        url: urlArg,
        options,
    };
}
/**
 * Try to parse response method chain: variable.json(), variable.text(), etc.
 */
function tryParseResponseMethodChain(topCall, variables) {
    if (topCall.callee.type !== "MemberExpression")
        return null;
    const member = topCall.callee;
    // Check if object is a variable identifier
    if (member.object.type !== "Identifier")
        return null;
    const varName = member.object.name;
    // Variable must exist (will be checked at runtime for Response type)
    if (!variables.has(varName))
        return null;
    assert(member.property.type === "Identifier", "Response method must be an identifier");
    const method = member.property.name;
    assert(ALLOWED_RESPONSE_METHODS.has(method), `Disallowed response method: ${method}. Allowed: ${[...ALLOWED_RESPONSE_METHODS].join(", ")}`);
    const args = topCall.arguments.map((a) => evalSafeLiteral(a));
    return {
        type: "responseMethod",
        variableName: varName,
        method,
        args,
    };
}
/**
 * Validate locator steps (used inside expect - no actions allowed).
 */
function validateLocatorSteps(steps) {
    assert(steps.length >= 1, "Empty locator chain");
    assert(ALLOWED_START_METHODS.has(steps[0].method), `First call must be one of: ${[...ALLOWED_START_METHODS].join(", ")}. Got: ${steps[0].method}`);
    // All steps must be start methods or chain methods (no actions in expect locators)
    for (let i = 0; i < steps.length; i++) {
        const m = steps[i].method;
        if (i === 0)
            continue; // start method already validated
        const isChain = ALLOWED_LOCATOR_CHAIN_METHODS.has(m);
        const isStart = ALLOWED_START_METHODS.has(m); // For nested locators
        assert(isChain || isStart, `Disallowed method in locator chain: ${m}. Allowed: ${[...ALLOWED_LOCATOR_CHAIN_METHODS].join(", ")}`);
    }
}
/**
 * Validate locator chain steps (actions allowed at the end).
 */
function validateLocatorChainSteps(steps) {
    assert(steps.length >= 1, "Empty chain");
    assert(ALLOWED_START_METHODS.has(steps[0].method), `First call must be one of: ${[...ALLOWED_START_METHODS].join(", ")}. Got: ${steps[0].method}`);
    // Validate each step is in allowlists
    for (let i = 0; i < steps.length; i++) {
        const m = steps[i].method;
        if (i === 0)
            continue; // start method already validated
        const isChain = ALLOWED_LOCATOR_CHAIN_METHODS.has(m);
        const isAction = ALLOWED_ACTION_METHODS.has(m);
        assert(isChain || isAction, `Disallowed method: ${m}. Allowed chain methods: ${[...ALLOWED_LOCATOR_CHAIN_METHODS].join(", ")}. Allowed action methods: ${[...ALLOWED_ACTION_METHODS].join(", ")}`);
        // If it's an action, it must be the last step
        if (isAction && i !== steps.length - 1) {
            assert(false, `Action method '${m}' must be the last in the chain, but found more methods after it`);
        }
    }
}
// =============================================================================
// ARGUMENT VALIDATION
// =============================================================================
/**
 * Per-method argument validation for extra safety.
 */
function validateMethodArgs(method, args) {
    switch (method) {
        case "locator":
            assert(typeof args[0] === "string", "locator(selector) requires a string selector");
            assert(args.length <= 2, "locator() accepts at most 2 arguments");
            break;
        case "getByRole":
            assert(typeof args[0] === "string", "getByRole(role) requires a string role");
            if (args[1] != null) {
                assert(typeof args[1] === "object" && !Array.isArray(args[1]), "getByRole() options must be an object");
            }
            break;
        case "getByText":
        case "getByLabel":
        case "getByPlaceholder":
        case "getByAltText":
        case "getByTitle":
            assert(typeof args[0] === "string" || args[0] instanceof RegExp, `${method}() requires a string or RegExp`);
            break;
        case "getByTestId":
            assert(typeof args[0] === "string" || args[0] instanceof RegExp, "getByTestId() requires a string or RegExp");
            break;
        case "nth":
            assert(typeof args[0] === "number" && Number.isInteger(args[0]), "nth(index) requires an integer index");
            break;
        case "fill":
        case "type":
            assert(typeof args[0] === "string", `${method}(value) requires a string value`);
            break;
        case "press":
            assert(typeof args[0] === "string", "press(key) requires a string key");
            break;
        case "selectOption":
            // Can be string, array of strings, or object
            break;
        case "frameLocator":
            assert(typeof args[0] === "string", "frameLocator(selector) requires a string selector");
            break;
        // Actions that take no required arguments
        case "click":
        case "dblclick":
        case "check":
        case "uncheck":
        case "hover":
        case "focus":
        case "blur":
        case "clear":
        case "scrollIntoViewIfNeeded":
        case "first":
        case "last":
        case "count":
        case "isVisible":
        case "isEnabled":
        case "isChecked":
        case "textContent":
        case "innerText":
        case "innerHTML":
        case "inputValue":
            // These are fine with no args or optional args
            break;
        case "filter":
        case "and":
        case "or":
            // These take locator options
            break;
        case "waitFor":
        case "getAttribute":
            // These have their own validation in Playwright
            break;
        // Page-level methods
        case "goto":
            assert(typeof args[0] === "string", "goto(url) requires a string URL");
            validateFetchUrl(args[0]); // Block file://, localhost, and private IPs
            break;
        case "waitForURL":
            assert(typeof args[0] === "string" || args[0] instanceof RegExp, "waitForURL() requires a string or RegExp");
            break;
        case "waitForTimeout":
            assert(typeof args[0] === "number", "waitForTimeout(ms) requires a number");
            break;
        case "waitForSelector":
            assert(typeof args[0] === "string", "waitForSelector(selector) requires a string");
            break;
        case "waitForLoadState":
            // Optional state argument
            if (args[0] != null) {
                assert(typeof args[0] === "string", "waitForLoadState(state) requires a string state");
            }
            break;
        case "setViewportSize":
            assert(typeof args[0] === "object" && args[0] !== null, "setViewportSize({ width, height }) requires an object");
            break;
        // Keyboard methods
        case "insertText":
            assert(typeof args[0] === "string", "keyboard.insertText(text) requires a string");
            break;
        case "down":
        case "up":
            // Keyboard down/up take a key string
            if (args.length > 0) {
                assert(typeof args[0] === "string", `keyboard.${method}(key) requires a string key`);
            }
            break;
        // Mouse methods
        case "move":
            assert(typeof args[0] === "number" && typeof args[1] === "number", "mouse.move(x, y) requires two numbers");
            break;
        case "wheel":
            assert(typeof args[0] === "number" && typeof args[1] === "number", "mouse.wheel(deltaX, deltaY) requires two numbers");
            break;
        // Drag and drop
        case "dragTo":
            // dragTo takes a locator, which we can't easily validate here
            // Playwright will validate it at runtime
            break;
        // Page methods that take no required arguments
        case "reload":
        case "goBack":
        case "goForward":
        case "title":
        case "url":
        case "content":
        case "screenshot":
        case "close":
        case "bringToFront":
        case "waitForFunction":
            // These are fine with no args or optional args
            break;
        default:
            // Unknown method - this shouldn't happen if allowlists are correct
            break;
    }
}
// =============================================================================
// DATA PLACEHOLDER INTERPOLATION
// =============================================================================
/**
 * Escape a string value for safe insertion into a JavaScript string literal.
 * Handles both single and double quotes since scripts may use either.
 */
function escapeForStringLiteral(value) {
    return value
        .replace(/\\/g, "\\\\") // Escape backslashes first
        .replace(/'/g, "\\'") // Escape single quotes
        .replace(/"/g, '\\"') // Escape double quotes
        .replace(/\n/g, "\\n") // Escape newlines
        .replace(/\r/g, "\\r") // Escape carriage returns
        .replace(/\t/g, "\\t"); // Escape tabs
}
/**
 * Strip inline comments from a line of code.
 * Handles // comments while preserving // inside string literals.
 *
 * Examples:
 *   - 'page.goto("https://example.com") // comment' → 'page.goto("https://example.com")'
 *   - 'page.goto("https://example.com")' → 'page.goto("https://example.com")' (URL preserved)
 *   - "page.fill('input', 'test') // fill" → "page.fill('input', 'test')"
 */
function stripInlineComments(line) {
    let inString = null;
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = true;
            continue;
        }
        // Track string state
        if (char === '"' || char === "'") {
            if (inString === null) {
                inString = char;
            }
            else if (inString === char) {
                inString = null;
            }
            continue;
        }
        // Check for // comment start (only outside strings)
        if (inString === null && char === "/" && line[i + 1] === "/") {
            // Found comment start, return everything before it (trimmed)
            return line.slice(0, i).trim();
        }
    }
    return line;
}
/**
 * Replace {{run.xxx}} and {{global.xxx}} placeholders in a string with values from the data objects.
 * This is done BEFORE parsing to allow dynamic values in scripts.
 *
 * @param line - The line to interpolate
 * @param localValues - Values for {{run.xxx}} placeholders (e.g., {{run.email}}, {{run.extractedOtp}})
 * @param globalValues - Values for {{global.xxx}} placeholders (e.g., {{global.email}})
 */
function interpolatePlaceholders(line, localValues, globalValues) {
    let result = line;
    // Replace {{run.xxx}} placeholders
    if (localValues) {
        result = result.replace(/\{\{run\.(\w+)\}\}/g, (match) => {
            if (match in localValues) {
                return escapeForStringLiteral(localValues[match]);
            }
            return match; // Keep original if key not found
        });
    }
    // Replace {{global.xxx}} placeholders
    if (globalValues) {
        result = result.replace(/\{\{global\.(\w+)\}\}/g, (match) => {
            if (match in globalValues) {
                return escapeForStringLiteral(globalValues[match]);
            }
            return match; // Keep original if key not found
        });
    }
    return result;
}
// =============================================================================
// GETTER RESULT LOGGING
// =============================================================================
/**
 * Format a value for logging (handles objects, arrays, strings, etc.)
 */
function formatResultForLog(value) {
    if (value === null)
        return "null";
    if (value === undefined)
        return "undefined";
    if (typeof value === "string")
        return `"${value}"`;
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value);
    }
}
/**
 * Log the result of a getter method call.
 */
function logGetterResult(methodPath, result) {
    logger_1.logger.debug(`[SecureScriptRunner] ${methodPath} → ${formatResultForLog(result)}`);
}
/**
 * Safely execute a user-supplied Playwright script.
 *
 * The script is parsed as an AST and validated to only contain allowed
 * Playwright method chains. User code is NEVER evaluated directly.
 *
 * @example
 * await runSecureScript({
 *   page,
 *   script: 'page.getByRole("button", { name: "Save" }).click()',
 * });
 *
 * @example
 * // Multi-line scripts (each line is executed in order)
 * await runSecureScript({
 *   page,
 *   script: `
 *     page.getByLabel("Email").fill("test@example.com")
 *     page.getByLabel("Password").fill("password123")
 *     page.getByRole("button", { name: "Submit" }).click()
 *   `,
 * });
 */
async function runSecureScript({ page: pageInput, script, localValues, globalValues, expect: expectFn, }) {
    // Resolve to the currently-active page at script start. Scripts are
    // short-lived, so we don't re-resolve per-line; if the script itself opens
    // a tab, the auto-switch happens for subsequent steps, not within the script.
    const page = (0, index_1.resolvePage)(pageInput);
    // Variable storage for the script context
    const variables = new Map();
    // Track the last result for return value
    let lastResult = undefined;
    // Split script into lines, strip comments, and filter out empty lines
    const lines = script
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//") && !line.startsWith("#"))
        .map((line) => stripInlineComments(line)) // Strip inline comments
        .filter((line) => line); // Filter out lines that became empty after stripping
    if (lines.length === 0) {
        throw new Error("[SecureScriptRunner] Script is empty");
    }
    for (const rawLine of lines) {
        // Interpolate placeholders ({{run.xxx}} and {{global.xxx}})
        const line = interpolatePlaceholders(rawLine, localValues, globalValues);
        // Remove trailing semicolons (optional in our DSL)
        const cleanLine = line.replace(/;$/, "").trim();
        // Parse as a single JS statement (supporting variable declarations and await)
        let ast;
        try {
            // Use sourceType: 'module' to allow top-level await
            ast = (0, acorn_1.parse)(cleanLine, {
                ecmaVersion: "latest",
                sourceType: "module",
            });
        }
        catch (parseError) {
            throw new Error(`[SecureScriptRunner] Failed to parse line: "${cleanLine}"\nParse error: ${parseError.message}`);
        }
        assert(ast.type === "Program", "Invalid program");
        assert(ast.body.length === 1, "Only one statement per line is allowed");
        const stmt = ast.body[0];
        // Handle variable declarations: const x = await fetch(...) or const y = await res.json()
        if (stmt.type === "VariableDeclaration") {
            const varDecl = stmt;
            assert(varDecl.declarations.length === 1, "Only one variable per declaration");
            assert(varDecl.kind === "const" || varDecl.kind === "let", "Only const/let declarations allowed");
            const declarator = varDecl.declarations[0];
            assert(declarator.id.type === "Identifier", "Variable name must be identifier");
            const varName = declarator.id.name;
            // Validate variable name (no reserved names)
            assert(!RESERVED_VARIABLE_NAMES.has(varName), `Cannot use reserved name: ${varName}`);
            assert(declarator.init !== null, "Variable must have initializer");
            // Handle await expression in the initializer
            let initExpr = declarator.init;
            if (initExpr.type === "AwaitExpression") {
                initExpr = initExpr.argument;
            }
            // Check if the initializer is a literal value (string, number, etc.)
            // This allows: const url = "{{run.url}}" or const count = 5
            if (isLiteralNode(initExpr)) {
                const literalValue = evalSafeLiteral(initExpr);
                variables.set(varName, literalValue);
                lastResult = literalValue;
                continue;
            }
            // Try computed expression (new URL(...), string concat, etc.)
            const computedExpr = parseSafeExpression(initExpr, variables);
            if (computedExpr) {
                const computedValue = evalSafeExpression(computedExpr, variables);
                variables.set(varName, computedValue);
                lastResult = computedValue;
                continue;
            }
            // Parse the initializer expression (must be a function call)
            const parsedInit = parseAllowedChain(initExpr, variables);
            // Execute the initializer and store result
            const result = await executeChain(parsedInit, page, variables, expectFn);
            variables.set(varName, result);
            lastResult = result;
            continue;
        }
        assert(stmt.type === "ExpressionStatement", "Only expression statements or variable declarations are allowed");
        // Handle await expression at the statement level
        let exprNode = stmt.expression;
        if (exprNode.type === "AwaitExpression") {
            exprNode = exprNode.argument;
        }
        const parsed = parseAllowedChain(exprNode, variables);
        lastResult = await executeChain(parsed, page, variables, expectFn);
    }
    return lastResult;
}
/**
 * Execute a parsed chain and return the result.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
async function executeChain(parsed, page, variables, expectFn) {
    switch (parsed.type) {
        case "expect": {
            // Handle expect() assertion
            assert(expectFn !== undefined, "expect() assertions require passing the 'expect' function to runSecureScript");
            // Build the locator from the steps
            let locator = page;
            for (const { method, args } of parsed.locatorSteps) {
                validateMethodArgs(method, args);
                locator = locator[method](...args);
            }
            // Call expect(locator).assertionMethod(args) or expect(locator).not.assertionMethod(args)
            let expectation = expectFn(locator);
            if (parsed.negated) {
                expectation = expectation.not;
            }
            const assertion = expectation[parsed.assertionMethod](...parsed.assertionArgs);
            // Await if it's a promise (most assertions are async)
            if (assertion instanceof Promise) {
                await assertion;
            }
            return undefined;
        }
        case "expectValue": {
            // Handle expect() with a variable value: expect(data.url).toBe(...)
            assert(expectFn !== undefined, "expect() assertions require passing the 'expect' function to runSecureScript");
            // Get the variable value
            const varValue = variables.get(parsed.variableName);
            assert(varValue !== undefined, `Variable "${parsed.variableName}" is not defined`);
            // Navigate the property path
            let value = varValue;
            for (const prop of parsed.propertyPath) {
                assert(value !== null && value !== undefined, `Cannot read property "${prop}" of ${value}`);
                value = value[prop];
            }
            // Call expect(value).assertionMethod(args) or expect(value).not.assertionMethod(args)
            let expectation = expectFn(value);
            if (parsed.negated) {
                expectation = expectation.not;
            }
            const assertion = expectation[parsed.assertionMethod](...parsed.assertionArgs);
            // Await if it's a promise
            if (assertion instanceof Promise) {
                await assertion;
            }
            return undefined;
        }
        case "expectLiteral": {
            // Handle expect() with a literal value: expect("string").toBe(...)
            assert(expectFn !== undefined, "expect() assertions require passing the 'expect' function to runSecureScript");
            // Call expect(literalValue).assertionMethod(args) or expect(literalValue).not.assertionMethod(args)
            let expectation = expectFn(parsed.literalValue);
            if (parsed.negated) {
                expectation = expectation.not;
            }
            const assertion = expectation[parsed.assertionMethod](...parsed.assertionArgs);
            // Await if it's a promise
            if (assertion instanceof Promise) {
                await assertion;
            }
            return undefined;
        }
        case "pageMethod": {
            // Handle page-level methods like goto, reload, etc.
            validateMethodArgs(parsed.method, parsed.args);
            const result = page[parsed.method](...parsed.args);
            const resolvedResult = result instanceof Promise ? await result : result;
            // Auto-log getter method results
            if (GETTER_METHODS.has(parsed.method)) {
                logGetterResult(`page.${parsed.method}()`, resolvedResult);
            }
            return resolvedResult;
        }
        case "keyboard": {
            // Handle page.keyboard.xxx() methods
            validateMethodArgs(parsed.method, parsed.args);
            const result = page.keyboard[parsed.method](...parsed.args);
            if (result instanceof Promise) {
                return await result;
            }
            return result;
        }
        case "mouse": {
            // Handle page.mouse.xxx() methods
            validateMethodArgs(parsed.method, parsed.args);
            const result = page.mouse[parsed.method](...parsed.args);
            if (result instanceof Promise) {
                return await result;
            }
            return result;
        }
        case "context": {
            // Handle context.xxx() methods (executed as page.context().xxx())
            validateMethodArgs(parsed.method, parsed.args);
            const context = page.context();
            const result = context[parsed.method](...parsed.args);
            const resolvedResult = result instanceof Promise ? await result : result;
            // Auto-log getter method results
            if (GETTER_METHODS.has(parsed.method)) {
                logGetterResult(`context.${parsed.method}()`, resolvedResult);
            }
            return resolvedResult;
        }
        case "browser": {
            // Handle browser.xxx() methods (executed as page.context().browser()?.xxx())
            validateMethodArgs(parsed.method, parsed.args);
            const browser = page.context().browser();
            assert(browser !== null, "Browser is not available");
            const result = browser[parsed.method](...parsed.args);
            const resolvedResult = result instanceof Promise ? await result : result;
            // Auto-log getter method results
            if (GETTER_METHODS.has(parsed.method)) {
                logGetterResult(`browser.${parsed.method}()`, resolvedResult);
            }
            return resolvedResult;
        }
        case "console": {
            // Handle console.xxx() methods (log, warn, error, info, debug)
            const consoleMethod = console[parsed.method];
            consoleMethod(...parsed.args);
            return undefined;
        }
        case "fetch": {
            // Handle fetch() calls
            const fetchOptions = {};
            if (parsed.options?.method) {
                fetchOptions.method = parsed.options.method;
            }
            if (parsed.options?.headers) {
                fetchOptions.headers = parsed.options.headers;
            }
            if (parsed.options?.body) {
                fetchOptions.body =
                    typeof parsed.options.body === "string"
                        ? parsed.options.body
                        : JSON.stringify(parsed.options.body);
            }
            // DNS rebinding protection: verify resolved IP is not blocked
            await validateFetchUrlResolution(parsed.url);
            const response = await fetch(parsed.url, fetchOptions);
            logger_1.logger.debug(`[SecureScriptRunner] fetch(${parsed.url}) → ${response.status}`);
            return response;
        }
        case "responseMethod": {
            // Handle response method calls (res.json(), res.text())
            const response = variables.get(parsed.variableName);
            assert(response instanceof Response, `Variable "${parsed.variableName}" is not a Response object`);
            const result = await response[parsed.method](...parsed.args);
            logger_1.logger.debug(`[SecureScriptRunner] ${parsed.variableName}.${parsed.method}() completed`);
            return result;
        }
        case "variableDeclaration": {
            // This case shouldn't be reached since variable declarations are handled earlier
            // But include for completeness
            const result = await executeChain(parsed.value, page, variables, expectFn);
            return result;
        }
        case "locator": {
            // Handle locator chain (page.getByRole().click())
            let cur = page;
            const lastStep = parsed.steps[parsed.steps.length - 1];
            for (const { method, args } of parsed.steps) {
                validateMethodArgs(method, args);
                const result = cur[method](...args);
                if (result instanceof Promise) {
                    cur = await result;
                }
                else {
                    cur = result;
                }
            }
            // Auto-log getter method results (last method in chain)
            if (lastStep && GETTER_METHODS.has(lastStep.method)) {
                const chainPath = parsed.steps.map((s) => `${s.method}()`).join(".");
                logGetterResult(`page.${chainPath}`, cur);
            }
            return cur;
        }
        default: {
            // Exhaustive check - should never reach here
            const _exhaustive = parsed;
            throw new Error(`Unknown chain type: ${_exhaustive.type}`);
        }
    }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
/**
 * Validate a script without executing it.
 * Useful for pre-validation before saving scripts.
 *
 * @returns true if valid, throws Error if invalid
 */
function validateScript(script) {
    // Track declared variables for validation
    const declaredVariables = new Map();
    const lines = script
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//") && !line.startsWith("#"))
        .map((line) => stripInlineComments(line)) // Strip inline comments
        .filter((line) => line); // Filter out lines that became empty after stripping
    if (lines.length === 0) {
        throw new Error("[SecureScriptRunner] Script is empty");
    }
    for (const line of lines) {
        const cleanLine = line.replace(/;$/, "").trim();
        // Note: We can't interpolate placeholders during validation
        // because we don't have the data. We'll validate the structure only.
        // Replace placeholders with a dummy value for parsing.
        // The placeholder is already inside quotes, so we just replace the {{...}} part.
        const lineForParsing = cleanLine
            .replace(/\{\{run\.\w+\}\}/g, "__PLACEHOLDER__")
            .replace(/\{\{global\.\w+\}\}/g, "__PLACEHOLDER__");
        let ast;
        try {
            // Use sourceType: 'module' to allow top-level await
            ast = (0, acorn_1.parse)(lineForParsing, {
                ecmaVersion: "latest",
                sourceType: "module",
            });
        }
        catch (parseError) {
            throw new Error(`[SecureScriptRunner] Failed to parse line: "${cleanLine}"\nParse error: ${parseError.message}`);
        }
        assert(ast.type === "Program", "Invalid program");
        assert(ast.body.length === 1, "Only one statement per line is allowed");
        const stmt = ast.body[0];
        // Handle variable declarations
        if (stmt.type === "VariableDeclaration") {
            const varDecl = stmt;
            assert(varDecl.declarations.length === 1, "Only one variable per declaration");
            assert(varDecl.kind === "const" || varDecl.kind === "let", "Only const/let declarations allowed");
            const declarator = varDecl.declarations[0];
            assert(declarator.id.type === "Identifier", "Variable name must be identifier");
            const varName = declarator.id.name;
            // Validate variable name (no reserved names)
            assert(!RESERVED_VARIABLE_NAMES.has(varName), `Cannot use reserved name: ${varName}`);
            assert(declarator.init !== null, "Variable must have initializer");
            // Handle await expression in the initializer
            let initExpr = declarator.init;
            if (initExpr.type === "AwaitExpression") {
                initExpr = initExpr.argument;
            }
            // Check if the initializer is a literal value
            if (isLiteralNode(initExpr)) {
                // Validate that it's a safe literal (will throw if not)
                evalSafeLiteral(initExpr);
                declaredVariables.set(varName, "__PLACEHOLDER__");
                continue;
            }
            // Try computed expression (validates structure without executing)
            const computedExpr = parseSafeExpression(initExpr, declaredVariables);
            if (computedExpr) {
                declaredVariables.set(varName, "__COMPUTED_PLACEHOLDER__");
                continue;
            }
            // Parse the initializer expression (this will throw if invalid)
            parseAllowedChain(initExpr, declaredVariables);
            // Mark variable as declared (with placeholder value for validation)
            declaredVariables.set(varName, "__PLACEHOLDER__");
            continue;
        }
        assert(stmt.type === "ExpressionStatement", "Only expression statements or variable declarations are allowed");
        // Handle await expression at the statement level
        let exprNode = stmt.expression;
        if (exprNode.type === "AwaitExpression") {
            exprNode = exprNode.argument;
        }
        // This will throw if the chain is invalid
        parseAllowedChain(exprNode, declaredVariables);
    }
    return true;
}
