import Long = require("long")
export function zeroPad(input: string, length: number) {
    return (Array(length + 1).join("0") + input).slice(-length)
}

export function hycontoString(val: Long): string {
    const valStr = val.toString()
    const integer = (valStr.length >= 10) ? valStr.slice(0, -9) : "0"
    const decimal = (valStr.length >= 10) ? valStr.slice(-9) : zeroPad(valStr, 9)

    let trimed
    for (const d of decimal.split("").reverse().join("")) {
        if (d !== "0") { trimed = decimal.slice(0, decimal.indexOf(d) + 1); break }
    }
    const result = trimed === undefined ? integer : integer + "." + trimed
    return result
}

export function hyconfromString(val: string): Long {
    if (val === "") { return Long.fromNumber(0) }
    if (val[val.length - 1] === ".") { val += "0" }
    const arr = val.toString().split(".")
    let hycon = Long.fromString(arr[0], true).multiply(Math.pow(10, 9))
    if (arr.length > 1) {
        arr[1] = arr[1].length > 9 ? arr[1].slice(0, 9) : arr[1]
        const subCon = Long.fromString(arr[1], true).multiply(Math.pow(10, 9 - arr[1].length))
        hycon = hycon.add(subCon)
    }
    return hycon.toUnsigned()
}
