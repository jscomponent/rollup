import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

let replaceAsync = async (str, regex, asyncFn) => {
    let promises = []
    str.replace(regex, (match, ...args) => {
        const promise = asyncFn(match, ...args)
        promises.push(promise)
    })
    const data = await Promise.all(promises)
    return str.replace(regex, () => data.shift())
}

let load = async (url, origin = '', p = '') => {
    if (url.includes('+esm')) return url // @todo - Can not resolve all esm files at jsdelivr, use direct link instead
    let hash = crypto.createHash('sha256').update(url + origin + p, 'utf8').digest('hex')
    if (fs.existsSync('./cache/' + hash + '.js')) {
        return path.resolve('./cache/' + hash + '.js')
    } else if (!fs.existsSync('./cache')) {
        fs.mkdirSync('./cache', { recursive: true })
    }
    if (url.startsWith('http')) {
        let src = await fetch(url)
        let content = await src.text()
        let uri = new URL(url)
        origin = uri.protocol + '//' + uri.host + (uri.port ? ':' + uri.port : '')
        content = await replaceImports(content, origin, uri.pathname)
        fs.writeFileSync('./cache/' + hash + '.js', content)
        return path.resolve('./cache/' + hash + '.js')
    } else if (origin.startsWith('http') && url.startsWith('/')) {
        let uri = origin + url
        let src = await fetch(uri)
        let content = await src.text()
        content = await replaceImports(content, origin, p)
        fs.writeFileSync('./cache/' + hash + '.js', content)
        return path.resolve('./cache/' + hash + '.js')
    } else if (origin.startsWith('http') && url.startsWith('./')) {
        let uri = origin + p + url
        let src = await fetch(uri)
        let content = await src.text()
        content = await replaceImports(content, origin, p)
        fs.writeFileSync('./cache/' + hash + '.js', content)
        return path.resolve('./cache/' + hash + '.js')
    }
    return url
}

let replaceImports = async (src, origin = '', path = '') => {
    src = src.replaceAll('}from"', ' } from "')
    src = src.replaceAll('import{', 'import { ')
    src = src.replaceAll('import*', 'import * ')
    src = src.replaceAll('export{', 'export { ')
    src = src.replaceAll('export*', 'export * ')
    src = src.replaceAll('from"', 'from "')
    src = await replaceAsync(src, /(?:import\(')(.*?)(?='\))/g, async (match, $1) => {
        let url = await load($1, origin, path)
        return match.replace($1, url)
    })
    src = await replaceAsync(src, /(?:import\(")(.*?)(?="\))/g, async (match, $1) => {
        let url = await load($1, origin, path)
        return match.replace($1, url)
    })
    src = await replaceAsync(src, /(?:import\(`)(.*?)(?=`\))/g, async (match, $1) => {
        let url = await load($1, origin, path)
        return match.replace($1, url)
    })
    src = await replaceAsync(src,
        /import\s+?(?:(?:(?:[\w*\s{},]*)\s+from\s+?)|)(?:(?:".*?")|(?:'.*?'))[\s]*?(?:;|$|)/g,
        async (match) => {
            match = await replaceAsync(match, /'(.*?)'/, async (m) => {
                m = await load(m.split(`'`)[1], origin, path)
                return `'` + m + `'`
            })
            match = await replaceAsync(match, /"(.*?)"/, async (m) => {
                m = await load(m.split(`"`)[1], origin, path)
                return `"` + m + `"`
            })
            match = await replaceAsync(match, /`(.*?)`/, async (m) => {
                m = await load(m.split('`')[1], origin, path)
                return '`' + m + '`'
            })
            return match + `\n`
        }
    )
    src = await replaceAsync(src, /(?:export\(')(.*?)(?='\))/g, async (match, $1) => {
        let url = await load($1, origin, path)
        return match.replace($1, url)
    })
    src = await replaceAsync(src, /(?:export\(")(.*?)(?="\))/g, async (match, $1) => {
        let url = await load($1, origin, path)
        return match.replace($1, url)
    })
    src = await replaceAsync(src, /(?:export\(`)(.*?)(?=`\))/g, async (match, $1) => {
        let url = await load($1, origin, path)
        return match.replace($1, url)
    })
    src = await replaceAsync(src,
        /export\s+?(?:(?:(?:[\w*\s{},]*)\s+from\s+?)|)(?:(?:".*?")|(?:'.*?'))[\s]*?(?:;|$|)/g,
        async (match) => {
            match = await replaceAsync(match, /'(.*?)'/, async (m) => {
                m = await load(m.split(`'`)[1], origin, path)
                return `'` + m + `'`
            })
            match = await replaceAsync(match, /"(.*?)"/, async (m) => {
                m = await load(m.split(`"`)[1], origin, path)
                return `"` + m + `"`
            })
            match = await replaceAsync(match, /`(.*?)`/, async (m) => {
                m = await load(m.split('`')[1], origin, path)
                return '`' + m + '`'
            })
            return match + `\n`
        }
    )
    return src
}

export default () => {
    return {
        async transform(src, id) {
            if (
                !id.includes('/node_modules/') &&
                id.endsWith('.js') || id.endsWith('.mjs') || id.endsWith('.ts') || id.endsWith('.vue')
            ) {
                return {
                    code: await replaceImports(src),
                    map: null
                }
            }
            return null
        }
    }
}