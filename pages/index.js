                          </button>
                          <button
                            onClick={() => deleteRow(i)}
                            className="ml-3 text-red-400 hover:text-red-500"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {colorMenu.open && (
        <div
          id="color-menu-portal"
          className="fixed z-50"
          style={{ top: colorMenu.y, left: colorMenu.x }}
        >
          <div className="bg-neutral-900 border border-neutral-700 rounded-md shadow-lg p-2 min-w-[180px]">
            <div className="text-xs text-neutral-400 px-1 pb-1">Choose color</div>
            <button
              onClick={() => applyColorToRow(colorMenu.tab, colorMenu.index, "")}
              className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800 text-sm"
            >
              <span className="h-3 w-3 rounded border border-neutral-600 bg-transparent" />
              None
            </button>
            {settings.colors.map((c) => (
              <button
                key={c.name + c.hex}
                onClick={() => applyColorToRow(colorMenu.tab, colorMenu.index, c.hex)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-neutral-800 text-sm"
              >
                <span
                  className="h-3 w-3 rounded border border-neutral-600"
                  style={{ backgroundColor: c.hex }}
                />
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
