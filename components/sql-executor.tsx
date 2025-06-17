"use client"

import type React from "react"
import { useState } from "react"
import AceEditor from "react-ace"
import "ace-builds/src-noconflict/mode-sql"
import "ace-builds/src-noconflict/theme-github"
import "ace-builds/src-noconflict/ext-language_tools"

interface Script {
  title: string
  description: string
  filename: string
  sql: string
}

const scripts: Script[] = [
  {
    title: "Пример скрипта",
    description: "Простой пример SQL скрипта",
    filename: "example.sql",
    sql: "-- Пример SQL скрипта\nSELECT * FROM users;",
  },
  {
    title: "Скрипт создания таблицы",
    description: "Создает таблицу users с полями id, name, email",
    filename: "create_table.sql",
    sql: "-- Скрипт создания таблицы users\nCREATE TABLE users (\n  id INT PRIMARY KEY,\n  name VARCHAR(255),\n  email VARCHAR(255)\n);",
  },
  {
    title: "Скрипт вставки данных",
    description: "Вставляет несколько записей в таблицу users",
    filename: "insert_data.sql",
    sql: "-- Скрипт вставки данных в таблицу users\nINSERT INTO users (id, name, email) VALUES\n(1, 'John Doe', 'john.doe@example.com'),\n(2, 'Jane Smith', 'jane.smith@example.com');",
  },
  {
    title: "Конвертация цветов в HEX",
    description: "Конвертирует текстовые названия цветов в HEX формат",
    filename: "fix-color-to-hex.sql",
    sql: "-- Скрипт конвертации цветов в HEX формат\n-- (содержимое из scripts/fix-color-to-hex.sql)",
  },
]

const SQLExecutor: React.FC = () => {
  const [selectedScript, setSelectedScript] = useState<Script>(scripts[0])
  const [sqlQuery, setSqlQuery] = useState<string>(scripts[0].sql)

  const handleScriptChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedFilename = event.target.value
    const script = scripts.find((script) => script.filename === selectedFilename)
    if (script) {
      setSelectedScript(script)
      setSqlQuery(script.sql)
    }
  }

  const handleSqlChange = (value: string) => {
    setSqlQuery(value)
  }

  return (
    <div>
      <h2>SQL Executor</h2>
      <div>
        <label htmlFor="scriptSelect">Выберите скрипт:</label>
        <select id="scriptSelect" value={selectedScript.filename} onChange={handleScriptChange}>
          {scripts.map((script) => (
            <option key={script.filename} value={script.filename}>
              {script.title}
            </option>
          ))}
        </select>
        <p>{selectedScript.description}</p>
      </div>
      <AceEditor
        mode="sql"
        theme="github"
        onChange={handleSqlChange}
        name="sql-editor"
        value={sqlQuery}
        editorProps={{ $blockScrolling: true }}
        width="100%"
        height="300px"
      />
      <div>
        <button>Выполнить SQL</button>
      </div>
    </div>
  )
}

export default SQLExecutor
export { SQLExecutor as SqlExecutor }
