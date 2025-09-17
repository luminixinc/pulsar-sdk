/**
 * This class provides a helpful starting point for developing on the Pulsar for Salesforce platform. Instantiating this object in any Pulsar context will connect you to the platform via the WebViewJavasScriptBridge.
 *
 * Once initialized, the returned object provides a promise-based interface to all of Pulsar's JSAPI methods which enable you to build web applications that makes use of Pulsar's offline-first data management and powerful sync algorithm.
 */
export class Pulsar {

  constructor() {
    this.bridge = null;
    this.pulsar = null;
    this.isInitialized = false;
  }

  /* Initializes Pulsar and acquires the bridge. If we are in an FSL context, we will also have the pulsar object initialized as well. It is a good idea to wrap your call to init (async () => {})(). This ensures that the init method executes as early as possible and is not blocked by loading processes. */
  async init() {
    return new Promise((resolve, reject) => {
      if (this.isInitialized) {
        console.log('Pulsar: Initialization requested, but Pulsar is already initialized.');
        reject(new Error('Pulsar is already initialized.'));
      }
      console.log('Pulsar: Initializing...')
      // Embedded context
      if (window.parent?.pulsar?.bridge) {
        this.pulsar = window.parent.pulsar;
        this.bridge = this.pulsar.bridge;
        this.isInitialized = true;
        console.log('Pulsar: Initialized!');
        resolve(this);
      } else {
        // Native context
        // Use named function for easy removal
        const onBridgeReady = (event) => {
          clearTimeout(initTimeout);
          document.removeEventListener('WebViewJavascriptBridgeReady', onBridgeReady);

          this.bridge = event.bridge;
          if (typeof this.bridge.version === 'undefined') {
            this.bridge.init();
          }

          this.isInitialized = true;
          console.log('Pulsar: Initialized!');
          resolve(this);
        };

        document.addEventListener('WebViewJavascriptBridgeReady', onBridgeReady);

        // Clean up if the event never fires
        const initTimeout = setTimeout(() => {
          console.log('Pulsar: Failed to initialize. Did not register to receive WebViewJavascriptBridgeReady event in time.');
          document.removeEventListener('WebViewJavascriptBridgeReady', onBridgeReady);
          reject(new Error('Pulsar bridge initialization timed out.'));
        }, 5000);
      }
    });
  }


  /**
   * Registers an event handler for Pulsar bridge or pulsar object events.
   * Automatically delegates sync-related events in embedded contexts to avoid bridge handler conflicts.
   *
   * @param {string} handlerName - Name of the event to listen for.
   * @param {function} handlerFn - Callback to execute when the event is triggered.
   */
  registerHandler(handlerName, handlerFn) {
    if (!this.bridge) {
      throw new Error('Pulsar bridge not initialized. Call init() first.');
    }
    if (typeof handlerName !== 'string' || typeof handlerFn !== 'function') {
      throw new Error('Invalid parameters: handlerName must be a string and handlerFn must be a function.');
    }

    const isEmbedded = !!this.pulsar;
    const isSyncHandler = ['syncDataUpdate', 'syncDataFinished'].includes(handlerName);

    if (isEmbedded && isSyncHandler) {
      // Use embedded-safe registration via pulsar object
      if (handlerName === 'syncDataUpdate') {
        this.pulsar.addSyncDataUpdateHandler(handlerFn);
      } else if (handlerName === 'syncDataFinished') {
        this.pulsar.addSyncFinishedHandler(handlerFn);
      }
      console.warn(`Registered embedded-safe handler for ${handlerName} using pulsar object.`);
    } else {
      // Use raw bridge handler
      this.bridge.registerHandler(handlerName, handlerFn);
    }
  }

  /**
   * Deregisters an event handler from Pulsar bridge or pulsar object.
   * Avoids using bridge deregistration in embedded contexts for sync-related events.
   *
   * @param {string} handlerName - Name of the event to stop listening to.
   */
  deregisterHandler(handlerName) {
    if (!this.bridge) {
      throw new Error('Pulsar bridge not initialized. Call init() first.');
    }
    if (typeof handlerName !== 'string') {
      throw new Error('Invalid parameter: handlerName must be a string.');
    }

    const isEmbedded = !!this.pulsar;
    const isSyncHandler = ['syncDataUpdate', 'syncDataFinished'].includes(handlerName);

    if (isEmbedded && isSyncHandler) {
      // Use embedded-safe deregistration via pulsar object
      if (handlerName === 'syncDataUpdate') {
        this.pulsar.removeSyncDataUpdateHandler();
      } else if (handlerName === 'syncDataFinished') {
        this.pulsar.removeSyncFinishedHandler();
      }
      console.warn(`Deregistered embedded-safe handler for ${handlerName} using pulsar object.`);
    } else {
      // Use raw bridge deregistration
      this.bridge.deregisterHandler(handlerName);
    }
  }


  /** ******************************
   * JSAPI Methods
   ****************************** */
  /**
   * Read records from a Salesforce object. All values for all fields are returned as strings.
   * @param {string} objectName - Name of the SObject (e.g., 'Account')
   * @param {object} filters - Field-value filters (exact match)
   * @returns {Promise<object[]>}
   */
  async read(objectName, filters = {}) {
    return this._send({
      type: 'read',
      object: objectName,
      data: filters
    });
  }

  /**
   * Create a new Salesforce record
   * @param {string} objectName - Name of the SObject (e.g., 'Contact')
   * @param {object} fields - Fields and values for the new record
   * @param {object} [args] - Optional args (e.g., allowEditOnFailure)
   * @returns {Promise<string>} - The Id of the created record.
   */
  async create(objectName, fields = {}, args = {}) {
    return this._send({
      type: 'create',
      object: objectName,
      data: fields,
      args
    });
  }

  /**
   * Update a Salesforce record (must include Id in fields)
   * @param {string} objectName - Name of the SObject
   * @param {object} fields - Fields to update (must include Id)
   * @returns {Promise<string>} - The Id of the updated record.
   */
  async update(objectName, fields) {

    if (!fields.Id) {
      throw new Error(`Update requires 'Id' field.`);
    }

    return this._send({
      type: 'update',
      object: objectName,
      data: fields
    });
  }

  /**
   * Delete a Salesforce record by Id
   * @param {string} objectName - Name of the SObject
   * @param {string} id - Salesforce record Id
   * @returns {Promise<string>} - The Id of the deleted record.
   */
  async delete(objectName, id) {
    if (!id) throw new Error(`Delete requires an 'id' value.`);
    return this._send({
      type: 'delete',
      object: objectName,
      data: { Id: id }
    });
  }

  /**
   * Perform a local read-only SQLIte SELECT query on Pulsar's local database.
   * Useful for complex filters and local cache querying. All values for all fields
   * are returned as strings.
   *
   * @param {string} objectName - Name of the SObject (e.g., 'Account')
   * @param {string} query - SQLite SELECT query string
   * @returns {Promise<object[]>} - Array of matching records
   */
    async select(objectName, query) {
      if (!query || typeof query !== 'string') {
        throw new Error('Select query must be a valid SQLite string.');
      }

      return this._send({
        type: 'select',
        object: objectName,
        data: {
          query
        }
      });
    }

  /**
   * Represents the full DescribeLayout metadata returned by `pulsar.getLayout()`.
   * Mirrors Salesforce's DescribeLayoutResult structure.
   *
   * @typedef {Object} DescribeLayout
   * @property {DescribeLayoutButtonSection[]} buttonLayoutSection - Button groups defined on the layout.
   * @property {DescribeLayoutSection[]} detailLayoutSections - Layout sections for read-only/detail mode.
   * @property {DescribeLayoutSection[]} editLayoutSections - Layout sections for edit mode.
   * @property {DescribeLayoutSection[]} highlightsPanelLayoutSection - Layout section used in the highlights panel.
   * @property {string} id - Unique layout ID.
   * @property {DescribeLayoutSection[]} multirowEditLayoutSections - Multi-row sections (e.g., time-phased data).
   * @property {DescribeQuickActionListResult} quickActionList - Available quick actions.
   * @property {RelatedContent} relatedContent - Related content card definitions for mobile/Lightning.
   * @property {RelatedList[]} relatedLists - Related lists associated with the layout.
   * @property {DescribeLayoutSaveOption[]} saveOptions - Metadata about layout save behavior.
   */

  /**
   * List of available quick actions on the layout.
   *
   * @typedef {Object} DescribeQuickActionListResult
   * @property {DescribeQuickAction[]} quickActionListItems - Array of quick actions.
  */

  /**
   * A quick action (e.g., Create Task, New Event).
   *
   * @typedef {Object} DescribeQuickAction
   * @property {any} accessLevelRequired - UNUSED BY PULSAR.
   * @property {DescribeColor[]} colors - UNUSED BY PULSAR.
   * @property {string} flowDevName - The name of the Flow, if this is actually a Flow and not a quick action.
   * @property {string} iconUrl - UNUSED BY PULSAR. The URL of the icon associated with the action. This icon URL corresponds to the 32x32 icon used for the current Salesforce theme, introduced in Spring ‘10.
   * @property {DescribeIcons[]} icons - UNUSED BY PULSAR. Array of icons for this action. Each icon is associated with a theme. This field is available in API version 29.0 and later.
   * @property {string} label - The display label.
   * @property {string} miniIconUrl - The URL of the mini-icon associated with the action. This icon URL corresponds to the 16x16 icon used for the current Salesforce theme, introduced in Spring ‘10.
   * @property {string} name - The API name.
   * @property {string} quickActionName - The API name of the action.
   * @property {string} targetSobjectType - The API name of the action's target object.
   * @property {string} type - The QuickActionType of the action.
  * Valid values are:
    - Create
    - VisualforcePage
  */

  /**
   * A related list associated with the layout (e.g., Contacts under Account).
   *
   * @typedef {Object} RelatedList
   * @property {DescribeLayoutButton[]} buttons - Buttons associated with this related list.
   * @property {RelatedListColumn[]} columns - Columns associated with this related list.
    You can pair this value with Field to achieve a number of useful tasks, including determining whether the field is:
    - A name field, in order to present a link to the detail
    - Sortable, (to allow the user to include it in an ORDER BY clause to sort the rows by the given column
    - A currency field, to include the currency symbol or code
  * @property {string[]} constituentTypes - An array of the types of objects that reside in this related list.
  * @property {boolean} custom - If true, this related list is custom.
  * @property {string} field - Name of the field on the related (associated) object that establishes the relationship with the associating object. For example, for the Contact related list on Account, the value is AccountId.
  * @property {string} label - Label for the related list, displayed in the Salesforce user interface.
  * @property {int} limitRows - Number of rows to display.
  * @property {string} name - Name of the ChildRelationship in the DescribeSObjectResult for the sObjectType that was provided as the argument to DescribeLayout.
  * @property {string} sobject - Name of the sObjectType that is the row type for rows within this related list.
  * @property {RelatedListSort[]} sort - If not null, the columns that are used to order the related objects.
  */

  /**
   * Metadata about related content cards in Lightning layout (e.g., mobile cards).
   *
   * @typedef {Object} RelatedContent
   * @property {DescribeRelatedContentItem[]} relatedContentItems - An array of items in the Mobile Cards section of the page layout.
  */

  /**
   * Represents an individual item in the DescribeRelatedContentItem list.
   *
   * @typedef {Object} DescribeRelatedContentItem
   * @property {DescribeLayoutItem} describeLayoutItem - An individual layout item in the Mobile Cards section. Item must be wrapped in a DescribeRelatedContentItem to be added to the Mobile Cards section.
  */

  /**
   * Options or flags related to how the layout handles saves.
   *
   * @typedef {Object} DescribeLayoutSaveOption
   * @property {string} label - Display label for the option.
   * @property {string} name - Option identifier (e.g., "SaveAndNew").
  */

  /**
   * A section in a layout (e.g., "Contact Info").
   *
   * @typedef {Object} DescribeLayoutSection
   * @property {boolean} collapsed - An initial state indicating if this
   * @property {int} columns - The number of columns for each row in this section.
   * @property {string} heading - The section heading.
   * @property {DescribeLayoutRow[]} layoutRows - An array of the rows within this section.
   * @property {string} layoutSectionId - The ID of this layout.
   * @property {string} parentLayoutId - The ID of the layout upon which this DescribeLayoutSection resides.
   * @property {int} rows - The number of rows in this section.
   * @property {string} tabOrder - The order in which to traverse the fields when editing. Valid values are "LeftToRight" and "TopToBottom".
   * @property {boolean} useCollapsibleSection - Indicates whether this DescribeLayoutSection is a collapsible section, also known as a “twistie” (true), or not (false).
   * @property {boolean} useHeading - Indicates whether to display the heading (true) or not (false).
  */

  /**
   * A row inside a layout section.
   *
   * @typedef {Object} DescribeLayoutRow
   * @property {int} numItems - The number of items in this row.
   * @property {LayoutItem[]} layoutItems - Layout items (fields, spacers, etc.).
  */

  /**
   * A field or item in a layout row.
   *
   * @typedef {Object} LayoutItem
   * @property {string} label - A label for this layout item.
   * @property {string} required - "TRUE" if required.
   * @property {string} placeholder - "TRUE" if this is an empty item to be used as a placeholder.
   * @property {string} editableForNew - "TRUE" if this field can be edited during an object creation.
   * @property {string} editableForUpdate - "TRUE" if this field can be edited during an update to an object.
   * @property {LayoutComponent[]} - An array of `LayoutComponent` objects which determine how to display the field or fields that this item represents. When multiple
  */

  /**
   * A layout component inside a LayoutItem.
   *
   * @typedef {Object} LayoutComponent
   * @property {Component[]} components - An array of one or more components that make up this LayoutComponent. There will be more than one Component for LayoutComponents with fieldType `name`, `address`, and `location`.
   * @property {Field} details - The schema for this LayoutComponent.
   * @property {number} displayLines - The number of lines this component should take up. Relevant for displaying input or textarea fields.
   * @property {string} fieldType - The field type of this LayoutComponent. `name`, `address`, and `location` field types may require special layout.
   * @property {number} tabOrder - The order in which this field should take focus when tabbing through input fields.
   * @property {string} type - A value of either `Field` or `Separator`. `Field` should have its display value determined from the object whereas a `Separator` uses the `value` property of the `LayoutComponent` to display directly -- usually to join two values.
   * @property {string} value - Either the name of a `field` on the object to display, or a value to use as a separator.
  */

  /**
   * A Component definition for part of a LayoutComponent.
   *
   * @typedef {Object} Component
   * @property {Component[]} components - This should always be empty.
   * @property {Field} details - The schema for this field element.
   * @property {number} displayLines - The number of lines this component should take up. Relevant for displaying input or textarea fields.
   * * @property {number} tabOrder - The order in which this field should take focus when tabbing through input fields.
   * @property {string} type - A value of either `Field` or `Separator`. `Field` should have its display value determined from the object whereas a `Separator` uses the `value` property of the `Component` to display directly -- usually to join two values.
   * @property {string} value - Either the name of a `field` on the object to display, or a value to use as a separator.
  */

  /**
   * A button section on the layout (e.g., standard or custom buttons).
   *
   * @typedef {Object} DescribeLayoutButtonSection
   * @property {DescribeLayoutButton[]} buttons - Buttons in the section.
  */

  /**
   * A single button definition.
   *
   * @typedef {Object} DescribeLayoutButton
   * @property {string} name - The button name (e.g., "Edit").
   * @property {string} label - The button label.
   * @property {object} behavior - UNUSED BY PULSAR.
   * @property {DescribeColor[]} colors - UNUSED BY PULSAR. Array of color information associated with this button or link. Each color is associated with a theme.
   * @property {string} content - UNUSED BY PULSAR. The API name of the Visualforce page or s-control being delivered.
   * @property {WebLinkType} contentSource - UNUSED BY PULSAR.
   * @property {boolean} custom - Required. Indicates whether it's a custom button or link (true) or not (false).
   * @property {string} encoding - UNUSED BY PULSAR. The type of encoding assigned to the URL called by the button or link.
    * Valid values are:
      - UTF-8—Unicode (UTF-8)
      - ISO-8859-1—General US & Western Europe (ISO-8859–1, ISO-LATIN-1)
      - Shift_JIS—Japanese (Shift-JIS)
      - ISO-2022-JP—Japanese (JIS)
      - EUC-JP—Japanese (EUC-JP)
      - x-SJIS_0213—Japanese (Shift-JIS_2004)
      - ks_c_5601-1987—Korean (ks_c_5601-1987)
      - Big5—Traditional Chinese (Big5)
      - GB2312—Simplified Chinese (GB2312)
      - Big5-HKSCS—Traditional Chinese Hong Kong (Big5–HKSCS)
    * @property {int} height - UNUSED BY PULSAR.
    * @property {DescribeIcon[]} icons - UNUSED BY PULSAR.
    * @property {string} label - Label for the button or link displayed in the Salesforce user interface.
    * @property {boolean} menubar - UNUSED BY PULSAR.
    * @property {string} name - API name of the button or link.
    * @property {boolean} overridden - UNUSED BY PULSAR.
    * @property {boolean} resizeable - UNUSED BY PULSAR.
    * @property {boolean} scrollbars - UNUSED BY PULSAR.
    * @property {boolean} showsLocation - UNUSED BY PULSAR.
    * @property {boolean} showsStatus - UNUSED BY PULSAR.
    * @property {boolean} toolbar - UNUSED BY PULSAR.
    * @property {string} url - The URL called by the button or link. This field is null for standard buttons in a related list.
    * @property {int} width - UNUSED BY PULSAR. The width (in pixels) when a button or link's behavior field value is set to newWindow.
    * @property {Object} windowPosition - UNUSED BY PULSAR.
  */

  /**
   * Retrieves layout metadata for a Salesforce object.
   *
   * This method returns UI layout definitions for a given SObject, including sections, fields,
   * and record type-specific layouts. It is typically used to dynamically render forms or pages
   * that reflect Salesforce's native UI structure.
   *
   * It does not return information about Salesforce Listviews. This information is returned
   * by the `listviewMetadata` method.
   *
   * @param {string} objectName - API name of the SObject (e.g., 'Account', 'Contact').
   * @param {string} [recordTypeId] - Salesforce Record Type Id. This is the most common form.
   * @param {string} [recordTypeName] - Developer Name of the Record Type (used if Id is not provided).
   * @returns {Promise<DescribeLayout>} A parsed layout metadata object.
   * @throws {Error} If the layout response cannot be parsed or is in an unexpected format.
   *
   * @note Only one of `recordTypeId` or `recordTypeName` is required. If both are provided, `recordTypeId` takes precedence.
   *
   * @see {@link https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_calls_describelayout_describelayoutresult.htm Salesforce DescribeLayoutResult reference}
  */
  async getLayout(objectName, recordTypeId, recordTypeName) {
    const response = await this._send({
      type: 'getLayout',
      object: objectName,
      data: {
        ...(recordTypeId && { RecordTypeId: recordTypeId }),
        ...(!recordTypeId && recordTypeName && { RecordTypeName: recordTypeName }),
      }
    });

    if (typeof response === 'string') {
      try {
        return JSON.parse(response); // Handles Pulsar 11.0 and older
      } catch {
        throw new Error('Failed to parse layout response');
      }
    }

    if (typeof response === 'object' && response !== null) {
      return response; // Handles Pulsar 12.0+
    }

    throw new Error(`Unexpected return type. Expected JSON object or string, but received ${typeof response}.`);
  }


  /**
   * Returned by getLayoutSections, contains metadata about layout sections.
   * @typedef {Object} GetLayoutSectionResult
   * @property {string} display - "TRUE" if we should display a header for this section.
   * @property {string} heading - Heading text for this section.
   * @property {string} section - A string representation of the 0-indexed section order for this section.
  */

  /**
   * Retrieves layout section metadata for a Salesforce object.
   *
   * This method returns only the section-level metadata of a Salesforce layout,
   * which is useful for rendering record pages in view or edit modes.
   *
   * @param {string} objectName - API name of the SObject (e.g., 'Account', 'Contact').
   * @param {string} [recordTypeId] - Optional Salesforce Record Type Id.
   * @param {string} [recordTypeName] - Optional Developer Name of the Record Type (takes precedence over Id if both are provided).
   * @param {string} [layoutMode='display'] - Optional layout mode to fetch ('display' or 'edit').
   * @returns {Promise<GetLayoutSectionResult[]>} An array of layout section objects.
   * @throws {Error} If the response is malformed or cannot be parsed.
   *
   * @example
   * const sections = await pulsar.getLayoutSections('Account', '012000000000123', null, 'edit');
  */
  async getLayoutSections(objectName, recordTypeId, recordTypeName, layoutMode = 'display') {
    if (!objectName || typeof objectName !== 'string') {
      throw new Error('getLayoutSections requires a valid objectName string.');
    }

    const data = {};
    if (recordTypeName) {
      data.RecordTypeName = recordTypeName;
    } else if (recordTypeId) {
      data.RecordTypeId = recordTypeId;
    }
    if (layoutMode) {
      data.LayoutMode = layoutMode;
    }

    const response = await this._send({
      type: 'getLayoutSections',
      object: objectName,
      data,
    });

    if (typeof response === 'string') {
      try {
        return JSON.parse(response); // Support Pulsar < 12.0
      } catch {
        throw new Error('Failed to parse layout sections response');
      }
    }

    if (Array.isArray(response)) {
      return response;
    }

    throw new Error(`Unexpected return type from getLayoutSections. Expected array or JSON string, but received ${typeof response}.`);
  }


  /**
   * The smallest unit in a layout-a field or a separator.
   *
   * @typedef {Object} GetLayoutFieldResult
   * @property {string} displayLines - The number of vertical lines displayed for a field in the edit view. Applies to textarea and multi-select picklist fields.
   * @property {string} tabOrder - Indicates the tab order for the item in the row.
   * @property {string} type - A string representation of a `LayoutComponentType` for this `LayoutComponent`.
   * @property {string} name - The name of the field or canvas that this `LayoutComponent` represents.
   * @property {string} label - The label of the field of canvas that this `LayoutComponent` represents.
   * @property {string} placeHolder - When this string is equal to "TRUE" this `LayoutComponent` is a placeholder and should be blank. Otherwise it should display a value.
   * @property {string} required - When this string is "TRUE" the `LayoutComponent` is a required field for the SObject.
  */

  /**
   * Retrieves a flattened list of layout field metadata for a Salesforce object.
   *
   * This method returns field-level metadata for the layout used in display or edit mode.
   * It includes fields from all layout sections, and subcomponent fields (e.g., address parts).
   *
   * Only one of `recordTypeId` or `recordTypeName` should be provided. If both are passed,
   * `recordTypeName` takes precedence.
   *
   * @param {string} objectName - API name of the SObject (e.g., 'Account', 'Contact').
   * @param {string} [recordTypeId] - Salesforce Record Type Id.
   * @param {string} [recordTypeName] - Developer Name of the Record Type (takes precedence over Id).
   * @param {string} [layoutMode='display'] - Layout mode to fetch ('display' or 'edit').
   * @returns {Promise<GetLayoutFieldResult[]>} - An array of layout field metadata entries.
   * @throws {Error} If the objectName is invalid or the response is malformed.
   *
  */
  async getLayoutFields(objectName, recordTypeId, recordTypeName, layoutMode = 'display') {
    if (!objectName || typeof objectName !== 'string') {
      throw new Error('getLayoutFields requires a valid objectName string.');
    }

    const response = await this._send({
      type: 'getLayoutFields',
      object: objectName,
      data: {
        ...(recordTypeName && { RecordTypeName: recordTypeName }),
        ...(!recordTypeName && recordTypeId && { RecordTypeId: recordTypeId }),
        ...(layoutMode && { LayoutMode: layoutMode })
      }
    });

    if (typeof response === 'string') {
      try {
        return JSON.parse(response); // Pulsar < 12.0
      } catch {
        throw new Error('Failed to parse layout fields response');
      }
    }

    if (Array.isArray(response)) {
      return response;
    }

    throw new Error(`Unexpected return type from getLayoutFields. Expected array or JSON string, but received ${typeof response}.`);
  }


  /**
   * Retrieves the fields shown in a Salesforce Compact Layout for the given SObject.
   *
   * This method returns an array of field API names that are configured to appear
   * in the compact layout for the specified SObject and (optionally) record type.
   *
   * Only one of `recordTypeId` or `recordTypeName` should be provided. If both are,
   * `recordTypeName` takes precedence.
   *
   * @param {string} objectName - API name of the SObject (e.g., 'Contact', 'Account').
   * @param {string} [recordTypeId] - Salesforce Record Type Id.
   * @param {string} [recordTypeName] - Developer name of the record type (takes precedence over Id).
   * @returns {Promise<string[]>} - Array of field API names in the compact layout.
   * @throws {Error} If the bridge is not initialized or the response is malformed.
  */
  async getCompactLayoutFields(objectName, recordTypeId, recordTypeName) {
    if (!objectName || typeof objectName !== 'string') {
      throw new Error('getCompactLayoutFields requires a valid objectName string.');
    }

    const response = await this._send({
      type: 'getCompactLayoutFields',
      object: objectName,
      data: {
        ObjectType: objectName,
        ...(recordTypeName && { RecordTypeName: recordTypeName }),
        ...(!recordTypeName && recordTypeId && { RecordTypeId: recordTypeId }),
      },
    });

    if (!Array.isArray(response)) {
      throw new Error('Unexpected response format from getCompactLayoutFields. Expected array of field names.');
    }

    return response;
  }


  /**
   * DescribeSObjectResult is returned by getSObjectSchema. It represents the schema for an SObject.
   *
   * @typedef {Object} DescribeSObjectResult
   * @property {ActionOverride[]} actionOverrides - Custom page overrides for standard actions (e.g., View, Edit, New).
   * @property {boolean} activateable - Reserved for future use.
   * @property {string} associateEntityType - Type of the parent association, if any (e.g., History).
   * @property {string} associateParentEntity - API name of the parent entity, if applicable.
   * @property {ChildRelationship[]} childRelationships - Foreign key relationships from child objects to this object.
   * @property {boolean} compactLayoutable - Indicates if the object supports describeCompactLayouts().
   * @property {boolean} createable - Whether the object can be created.
   * @property {boolean} custom - Whether the object is custom (true) or standard (false).
   * @property {boolean} customSetting - Whether this object is a custom setting.
   * @property {boolean} dataTranslationEnabled - Indicates if data translation is enabled for the object.
   * @property {boolean} deepCloneable - Reserved for future use.
   * @property {string} defaultImplementation - Reserved for future use.
   * @property {boolean} deletable - Whether the object can be deleted.
   * @property {boolean} deprecatedAndHidden - Reserved for future use.
   * @property {string} extendedBy - Reserved for future use.
   * @property {string} extendsInterfaces - Reserved for future use.
   * @property {boolean} feedEnabled - Whether Chatter feeds are enabled for the object.
   * @property {Field[]} fields - Array of fields on the object.
   * @property {string} implementedBy - Reserved for future use.
   * @property {string} implementsInterfaces - Reserved for future use.
   * @property {boolean} isInterface - Reserved for future use.
   * @property {string} keyPrefix - Three-character key prefix for IDs of this object type.
   * @property {string} label - UI display label for the object.
   * @property {string} labelPlural - Plural label for the object.
   * @property {boolean} layoutable - Whether the object supports describeLayout().
   * @property {boolean} mergeable - Indicates if records of this object type can be merged.
   * @property {boolean} mruEnabled - Whether "Most Recently Used" tracking is enabled.
   * @property {string} name - API name of the object.
   * @property {NamedLayoutInfo[]} namedLayoutInfos - List of available named layouts.
   * @property {string} networkScopeFieldName - Field used to scope the object in Experience Cloud.
   * @property {boolean} queryable - Whether the object can be queried.
   * @property {RecordTypeInfo[]} recordTypeInfos - Array of record types for the object.
   * @property {boolean} replicateable - Whether the object supports getUpdated/getDeleted replication.
   * @property {boolean} retrieveable - Whether the object can be retrieved with retrieve().
   * @property {boolean} searchable - Whether the object can be searched.
   * @property {boolean} searchLayoutable - Whether search layouts can be described.
   * @property {ScopeInfo} supportedScopes - Describes supported data scopes for filtering (e.g., My Accounts).
   * @property {boolean} triggerable - Whether the object supports Apex triggers.
   * @property {boolean} undeletable - Whether deleted records can be undeleted.
   * @property {boolean} updateable - Whether the object can be updated.
   * @property {string} urlDetail - URL to the object's detail view in the UI.
   * @property {string} urlEdit - URL to the object's edit view in the UI.
   * @property {string} urlNew - URL to create a new record of this object.
  */

  /**
   * Field is returned as part of the schema metadata and is important in rendering fields of each SObject.
   *
   * @typedef {Object} Field
   * @property {boolean} autonumber - True if the field is auto-generated.
   * @property {number} byteLength - Max byte length of the field.
   * @property {boolean} calculated - True if the field is a formula.
   * @property {boolean} caseSensitive - True if values are case-sensitive.
   * @property {string} controllerName - Controlling field name for dependent picklists.
   * @property {boolean} createable - Whether the field can be created.
   * @property {boolean} custom - Whether the field is custom.
   * @property {boolean} dataTranslationEnabled - Whether data translation is enabled.
   * @property {boolean} defaultedOnCreate - Whether the field gets a default on create.
   * @property {string} defaultValueFormula - Formula for the default value.
   * @property {boolean} dependentPicklist - Whether the field is a dependent picklist.
   * @property {boolean} deprecatedAndHidden - Reserved for future use.
   * @property {number} digits - Max number of digits for numeric fields.
   * @property {boolean} displayLocationInDecimal - Whether geolocation is shown in decimal format.
   * @property {boolean} encrypted - Whether the field uses Shield Encryption.
   * @property {string} extraTypeInfo - Metadata about text, URL, or reference subtypes.
   * @property {boolean} filterable - Whether the field can be used in WHERE clauses.
   * @property {FilteredLookupInfo} filteredLookupInfo - Lookup filtering metadata, if applicable.
   * @property {string} formula - Formula used for calculated fields.
   * @property {boolean} groupable - Whether the field can be used in GROUP BY.
   * @property {boolean} highScaleNumber - Indicates support for 8-decimal precision.
   * @property {boolean} htmlFormatted - Whether the field value is HTML formatted.
   * @property {boolean} idLookup - Whether the field can be used in upsert() calls.
   * @property {string} inlineHelpText - Help text displayed for the field.
   * @property {string} label - Label for the field as shown in the UI.
   * @property {number} length - Max number of characters for string fields.
   * @property {string} name - API name of the field.
   * @property {boolean} nameField - Whether the field is the record's name field.
   * @property {boolean} namePointing - Whether the field is a foreign key to a name field.
   * @property {boolean} nillable - Whether the field is allowed to be null.
   * @property {boolean} permissionable - Whether the field's access can be restricted via permissions.
   * @property {PicklistEntry[]} picklistValues - Valid values for picklist fields.
   * @property {number} precision - Total number of digits for decimal fields.
   * @property {string[]} referenceTo - Target object(s) for lookup fields.
   * @property {string} relationshipName - Name of the relationship used in SOQL.
   * @property {number} relationshipOrder - Reserved for future use.
   * @property {boolean} restrictedPicklist - Whether picklist is restricted to defined values.
   * @property {number} scale - Number of digits after the decimal.
   * @property {string} soapType - SOAP type of the field (e.g., `xsd:string`).
   * @property {boolean} sortable - Whether the field can be used in ORDER BY clauses.
   * @property {string} type - Data type of the field (e.g., `string`, `boolean`, `reference`).
   * @property {boolean} unique - Whether the field must be unique.
   * @property {boolean} updateable - Whether the field can be updated.
   * @property {boolean} writeRequiresMasterRead - Whether writing to this field requires read access to the master object.
  */

  /**
   * Retrieves the schema metadata for a given Salesforce object.
   * Returns a DescribeSObjectResult, which includes information such as field types,
   * relationships, and record type mappings.
   *
   * @param {string} objectName - Name of the SObject (e.g., 'Account', 'Contact').
   * @returns {Promise<DescribeSObjectResult>} Parsed DescribeSObjectResult schema metadata.
   * @throws {Error} If the schema response cannot be parsed or is not in the expected format.
   *
   * @see {@link https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_calls_describesobjects_describesobjectresult.htm Salesforce DescribeSObjectResult reference }
   */
  async getSObjectSchema(objectName) {
    const response = await this._send({
      type: 'getSObjectSchema',
      object: objectName,
      data: {},
    });

    // The expected response is a JSON string representation of a DescribeSObjectResult
    if (typeof response === 'string') {
      try {
        return JSON.parse(response);
      } catch {
        throw new Error('Failed to parse schema response');
      }
    }

    throw new Error(`Unexpected return type. Expected JSON string but received ${typeof response}.`);
  }

  /**
   * Resolves a nested reference path (e.g., 'Owner.Manager.Name' or 'Contact.Name') from a base record.
   * Handles both direct and polymorphic relationships (multi-reference targets).
   *
   * @param {Object} record - The base record (e.g., Contact) corresponding to an SObject.
   * @param {string} path - Dot-separated field path to resolve.
   * @param {string} sObjectType - The base Salesforce object type (e.g., 'Contact').
   * @returns {Promise<string|null>} - The resolved value or null.
   */
  async resolveSOQLFieldPath(record, path, sObjectType) {
    let parts = path.split('.');

    // Strip root type qualifier if present
    if (parts[0] === sObjectType) {
      parts = parts.slice(1);
    }

    let currentRecord = record;
    let currentType = sObjectType;

    for (let i = 0; i < parts.length; i++) {
      const field = parts[i];
      const schema = await this.getSObjectSchema(currentType);

      // Final part: return the value
      if (i === parts.length - 1) {
        return currentRecord?.[field] ?? null;
      }

      // Relationship traversal
      const relationshipField = Object.values(schema.fields).find(f => f.relationshipName === field);
      if (!relationshipField) return null;

      const refId = currentRecord?.[relationshipField.name];
      if (!refId) return null;

      let refType = null;

      // Try to infer type from polymorphic reference (e.g., WhatId, WhoId)
      if (Array.isArray(relationshipField.referenceTo)) {
        if (relationshipField.referenceTo.length === 1) {
          refType = relationshipField.referenceTo[0];
        } else {
          // Try to use __type or attributes.type if available
          refType =
            currentRecord?.[relationshipField.name + '__r']?.attributes?.type ||
            currentRecord?.[relationshipField.name]?.attributes?.type ||
            relationshipField.referenceTo[0]; // fallback guess
        }
      }

      if (!refType) return null;

      const results = await this.read(refType, { Id: refId });
      currentRecord = results?.[0];
      currentType = refType;

      if (!currentRecord) return null;
    }

    return null;
  }


  /**
   * Initiates a Pulsar sync operation.
   * This triggers the sync process, which will run in the background.
   * You must register `syncDataFinished` and optionally `syncDataUpdate` handlers
   * beforehand using `registerHandler()` to receive progress and completion updates.
   *
   * @param {object} [options={}] - Optional sync configuration:
   *   @param {boolean} [options.singleObjectSyncEnabled] - Enable single-object sync mode.
   *   @param {string} [options.rootObjectId] - Record ID to sync when singleObjectSync is enabled.
   *   @param {string[]} [options.parentIdFieldList] - Parent reference fields to sync (or ['NONE']).
   *   @param {string[]} [options.childRelationshipList] - Child relationships to sync (or ['NONE']).
   *   @param {boolean} [options.pushChangesSyncEnabled] - If true, pushes only local changes.
   *   @param {boolean} [options.useComposite] - Use Salesforce Composite API.
   *   @param {boolean} [options.useCompositeGraph] - Use Salesforce Composite Graph API.
   *
   * @returns {Promise<void>} - Resolves when the sync request has been successfully sent.
   *   Does NOT wait for sync completion.
   */
  async syncData(options = {}) {
    const validKeys = [
      'singleObjectSyncEnabled',
      'rootObjectId',
      'parentIdFieldList',
      'childRelationshipList',
      'pushChangesSyncEnabled',
      'useComposite',
      'useCompositeGraph'
    ];

    const data = {};
    for (const key of validKeys) {
      if (key in options) {
        data[key] = options[key];
      }
    }

    return this._send({
      type: 'syncdata',
      data
    });
  }


  /**
   * Attempts to interrupt an active sync process.
   * This is useful for cancelling long-running or user-aborted syncs.
   *
   * @returns {Promise<boolean>} - Resolves to true if a sync was interrupted, false if no active sync was found.
   * @throws {Error} If the request fails or bridge is not initialized.
   */
  async interruptSync() {
    const response = await this._send({
      type: "interruptsync",
      data: {} // required but empty
    });

    if (typeof response === 'object' && response !== null && 'success' in response) {
      return Boolean(response.success);
    }

    throw new Error("Unexpected response format from interruptSync.");
  }

  /**
   *
   * @typedef {Object} UserInfo
   * @property {string} devicelanguage - The language locale for the device. e.g. "en-US"
   * @property {string} instanceurl - The URL for the current user instance. e.g. "https://userorg--sub.sandbox.my.salesforce.com/"
   * @property {string} lastfailedsync - string representation of the last failed sync attempt as as datetime. e.g. "2025-05-29T08:43:08.062Z"
   * @property {string} lastsuccessfulsync - string representation fo the last successful sync attempt as a datetime. e.g. "2025-06-18T18:06:12.416Z"
   * @property {string} locale - The locale for the salesfoce user. e.g. "en_US"
   * @property {string} orgDefaultCurrencyIsoCode - The currency ISO code configured for the users organization. e.g. "USD"
   * @property {string} orgDefaultCurrencyLocale - The locale to be used for formatting currency for this user. e.g. "en_US"
   * @property {string} organizationid: The Id for the Organization object that this user belongs to. e.g. "00D040000008fvYEAQ"
   * @property {string} sessionid - The current session Id for this user.
   * @property {string} userDefaultCurrencyIsoCode - The user's default currency ISO code. This takes precedence over the orgDefaultCurrencyIsoCode.
   * @property {string} userFullPhoto - A URL string to the full-sized photo for this user. e.g. "http://127.0.0.1:17014/images/userPhoto/full"
   * @property {string} userSmallPhoto - A URL string to the small-sized photo for this user. e.g. "http://127.0.0.1:17014/images/userPhoto/small"
   * @property {string} userfullname - The full name of this user. e.g. "Lamar Smith"
   * @property {string} userid - The User object Id for this user. e.g. "0056A000001wNP7QAM"
   * @property {string} userlanguage - The language locale for this user. Takes precedence over the devicelanguage. e.g. "en_US"
   * @property {string} username - The user's username. e.g. "lamars@luminixinc.com.lumfslbeta"
   * @property {string} userprofileid - The Id for the Profile object that belongs to this user. e.g. "00e6A000000ZyqXQAS"
   * @property {string} userprofilename - The profile name for this user. e.g. "Standard FSO User"
   * @property {string} userroleid - The Id for the Role object assigned to this user.
   * @property {string} userrolename - The name of the role assigned to this user.
   * @property {string} version - The version of salesforce that this user is using.
   */

  /**
   * Retrieves information about the currently logged-in Salesforce user and the Pulsar environment.
   *
   * @returns {Promise<UserInfo>} A promise resolving to a UserInfo object containing user and environment details
   * @throws {Error} If the bridge is not initialized or the response is malformed
   */
  async userInfo() {
    return this._send({
      type: 'userInfo',
      data: {} // Required by API, must be an empty object
    });
  }


  /**
   * Get the list of platform features and their availability.
   *
   * @typedef {Object} PlatformFeature
   * @property {string} featureName - The name of the feature.
   * @property {"TRUE"|"FALSE"} isAvailable - Whether the feature is available.
   * @property {string} [value] - Optional string value for the feature, if provided.
  */

  /**
   * Calls the JSAPI "getPlatformFeatures" method.
   *
   * @returns {Promise<PlatformFeature[]>} - Array of feature objects.
  */
  async getPlatformFeatures() {
    return this._send({
      type: 'getPlatformFeatures'
    });
  }


  /**
   * Triggers the generation of a PDF or image file from the current document.
   * This is commonly used for printing or exporting content in Pulsar-enabled apps.
   *
   * When calling this method from within a custom document, you can omit the docnode argument
   * if you wish to save the entire document.
   *
   * @param {Object} options - Options for controlling file generation.
   * @param {string} options.filename - (Required) The output file name (e.g., "report.pdf", "snapshot.png").
   * @param {number} [options.displayresult=0] - (Optional) Set to >0 to show the result; 0 for silent save.
   * @param {string} [options.datauri] - (Optional) A base64-encoded image or PDF data URI to save instead of capturing the screen.
   * @param {string} [options.docnode] - (Optional) DOM reference to the main document node (e.g., "window.document").
   * @param {string} [options.headernode] - (Optional) DOM reference to a header node (e.g., "document.getElementById('header')").
   * @param {string} [options.footernode] - (Optional) DOM reference to a footer node (e.g., "document.getElementById('footer')").
   * @param {Object} [options.printoptions] - (Optional) Advanced print and layout options.
   * @param {number} [options.printoptions.topmargin] - Top margin in points (1 inch = 72 points).
   * @param {number} [options.printoptions.leftmargin] - Left margin in points.
   * @param {number} [options.printoptions.bottommargin] - Bottom margin in points.
   * @param {number} [options.printoptions.rightmargin] - Right margin in points.
   * @param {string} [options.printoptions.papersize] - Page size (e.g., "a4", "letter").
   * @param {number} [options.printoptions.headerheight] - Height of the header section (in points).
   * @param {number} [options.printoptions.footerheight] - Height of the footer section (in points).
   * @param {boolean} [options.printoptions.useEdge] - Use the Chromium-based PDF renderer (recommended on Windows 15.0+).
   *
   * @returns {Promise<string>} - Resolves with the path to the saved file.
   * @throws {Error} If the bridge is uninitialized, the filename is missing, or the response is malformed.
   */
  async saveAs(options = {}) {

    if (!options.filename) throw new Error('saveAs requires a filename.');

    const response = await this._send({
      type: 'saveAs',
      data: options,
    });

    if (typeof response === 'object' && response !== null && 'FilePath' in response) {
      return response.FilePath;
    }

    throw new Error('Unexpected response from saveAs.');
  }


  /**
   * Creates a new Salesforce File (ContentDocument) from Base64 encoded data.
   *
   * This allows creation of Salesforce Files from in-memory data rather than device camera or file path.
   * The ParentId, Name, and Body fields are required. ContentType and NetworkId are optional.
   * Additional custom fields can also be passed in the options object.
   *
   * On success, resolves with the new ContentDocument Id.
   *
   * @param {string} parentId - Salesforce Id of the parent record (e.g., Account Id, WorkOrder Id).
   * @param {string} name - Name of the file (e.g., "Document.pdf").
   * @param {string} body - Base64 encoded file data.
   * @param {object} [options={}] - Optional additional fields:
   *   @param {string} [options.contentType] - MIME type of the file (e.g., "application/pdf").
   *   @param {string} [options.networkId] - Experience Cloud Network Id (for Communities).
   *   @param {...any} [options.customFields] - Any additional custom fields.
   * @returns {Promise<string>} - Resolves with the new ContentDocument Id.
   * @throws {Error} If the bridge is uninitialized or required parameters are missing/invalid.
   */
  async createSFFile(parentId, name, body, options = {}) {

    if (!parentId || typeof parentId !== 'string') {
      throw new Error('createSFFile requires a valid parentId string.');
    }
    if (!name || typeof name !== 'string') {
      throw new Error('createSFFile requires a valid file name string.');
    }
    if (!body || typeof body !== 'string') {
      throw new Error('createSFFile requires a valid base64-encoded body string.');
    }

    const { contentType, networkId, ...customFields } = options;

    return this._send({
      type: 'createSFFile',
      data: {
        ParentId: parentId,
        Name: name,
        Body: body,
        ...(contentType && { ContentType: contentType }),
        ...(networkId && { NetworkId: networkId }),
        ...customFields
      }
    });
  }

  /**
   * @typedef {Object} SFFileResult
   * @property {string} AttachmentId - The ID of the created or modified Attachment.
   * @property {string} ContentDocumentId - The ID of the created or modified ContentDocument.
   * @property {string} ContentVersionId - The ID of the created of modified ContentVersion
   * @property {string} FileURL - The URL to the created file.
  */

  /**
   * Creates a new Salesforce File (ContentDocument) from a device file path.
   *
   * This allows creation of Salesforce Files from an existing accessible file on the device.
   * The ParentId and FilePath are required. Name, ContentType, NetworkId, and any custom fields are optional.
   *
   * On success, resolves with the new ContentDocument Id.
   *
   * @param {string} parentId - Salesforce Id of the parent record (e.g., Account Id, WorkOrder Id).
   * @param {string} filePath - Local valid file path on the device (e.g., "/storage/emulated/0/DCIM/image.jpg").
   * @param {object} [options={}] - Optional fields:
   *   @param {string} [options.name] - Optional name to assign to the file instead of using the original.
   *   @param {string} [options.contentType] - MIME type of the file (e.g., "image/jpeg").
   *   @param {string} [options.networkId] - Salesforce Experience Cloud (Community) Network Id.
   *   @param {...any} [options.customFields] - Any additional custom fields.
   * @returns {Promise<SFFileResult>} - Resolves with an object containing the new AttachmentId, ContentDocumentId, ContentVersionId and FileURL.
   * @throws {Error} If the bridge is uninitialized or required parameters are missing/invalid.
   */
  async createSFFileFromFilePath(parentId, filePath, options = {}) {

    if (!parentId || typeof parentId !== 'string') {
      throw new Error('createSFFileFromFilePath requires a valid parentId string.');
    }
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('createSFFileFromFilePath requires a valid filePath string.');
    }

    const { name, contentType, networkId, ...customFields } = options;

    return this._send({
      type: 'createSFFileFromFilePath',
      data: {
        ParentId: parentId,
        FilePath: filePath,
        ...(name && { Name: name }),
        ...(contentType && { ContentType: contentType }),
        ...(networkId && { NetworkId: networkId }),
        ...customFields
      }
    });
  }


  /**
   * Creates a new Salesforce File from a device camera capture.
   *
   * This triggers the camera and saves the resulting image as a Salesforce File (ContentDocument).
   * The response data will be the Id of the newly created ContentDocument record.
   *
   * @param {string} parentId - The Salesforce Id of the parent SObject the file should be attached to (e.g., Account Id, WorkOrder Id).
   * @param {object} [options={}] - Optional fields to pass:
   *   @param {string} [options.name] - Optional file name to assign (defaults to the captured image name).
   *   @param {string} [options.networkId] - Optional Salesforce Experience Cloud (Community) Network Id.
   *   @param {...any} [options.customFields] - Any additional custom fields to pass (e.g., MyCustomField__c).
   * @returns {Promise<SFFileResult>} - Resolves with an object containing the new AttachmentId, ContentDocumentId, ContentVersionId and FileURL.
   * @throws {Error} If the bridge is uninitialized or parentId is invalid
   */
  async createSFFileFromCamera(parentId, options = {}) {

    if (!parentId || typeof parentId !== 'string') {
      throw new Error('createSFFileFromCamera requires a valid parentId string.');
    }

    const { name, networkId, ...customFields } = options;

    return this._send({
      type: 'createSFFileFromCamera',
      data: {
        ParentId: parentId,
        ...(name && { Name: name }),
        ...(networkId && { NetworkId: networkId }),
        ...customFields
      }
    });
  }

  /**
   * @typedef {object} SFFileInput
   * @property {string} ParentId - Salesforce Id of the parent SObject
   * @property {string} Name - File name
   * @property {string} Body - Base64-encoded file contents
   * @property {string} [ContentType] - MIME type of the file
   * @property {string} [Description] - Description of the file
   * @property {string} [NetworkId] - Experience Cloud Network Id
   * @property {any} [custom] - Any additional custom fields
  */

  /**
   * @typedef {object} CreateSFFileBatchResult
   * @property {string} success - `"TRUE"` or `"FALSE"`
   * @property {string} [objectId] - The ContentDocument Id or a temporary object Id (e.g., "CURIUM_...")
   * @property {string} [FileURL] - Local file URL on success
   * @property {string} [error] - Error message if `success` is `"FALSE"`
  */

  /**
   * @typedef {object} CreateSFFileBatchResponse
   * @property {{ success: "TRUE" | "FALSE" }} summary - Overall success status of the batch
   * @property {Object.<string, CreateSFFileBatchResult>} results - Result for each file, keyed by numeric index as string
  */

  /**
   * Creates multiple Salesforce Files (ContentDocuments) from Base64-encoded data.
   *
   * Each file entry must include:
   * - `ParentId` (string): Salesforce Id of the parent SObject (e.g., Account, WorkOrder)
   * - `Name` (string): File name
   * - `Body` (string): Base64-encoded file contents
   *
   * Optional fields per entry:
   * - `ContentType` (string): MIME type of the file (e.g., "application/pdf")
   * - `Description` (string): Description of the file
   * - `NetworkId` (string): Salesforce Experience Cloud (Community) Network Id
   * - Any custom fields supported by your org
   *
   * On success, resolves with the full `createbatchResponse`, which includes:
   * - `summary` (object): High-level batch result summary:
   *     - `{ success: "TRUE" }` on full success
   *     - `{ success: "FALSE" }` if any files failed
   * - `results` (object): A mapping from numeric string indices to result objects.
   *     Each result includes:
   *     - `objectId` (string): The ContentDocument Id or a temporary object Id (e.g., "CURIUM_...") on success
   *     - `success` (string): Either `"TRUE"` or `"FALSE"`
   *     - `FileURL` (string, optional): Local file URL on success
   *     - `error` (string, optional): Error message if `success` is `"FALSE"`
   *
   * Example:
   * {
   *   summary: { success: "FALSE" },
   *   results: {
   *     "0": {
   *       objectId: "069xx0000001234",
   *       success: "TRUE",
   *       FileURL: "http://127.0.0.1:17014/datacache/File1.jpg"
   *     },
   *     "1": {
   *       success: "FALSE",
   *       error: "Missing required field: ParentId"
   *     }
   *   }
   * }
   *
   * @param {Array<SFFileInput>} files - Array of file objects to upload
   * @returns {Promise<CreateSFFileBatchResponse>} - The full batch response including summary and results
   * @throws {Error} If the bridge is uninitialized or input is invalid
  */
  async createSFFileBatch(files) {

    if (!Array.isArray(files) || files.length === 0 || !files.every(f => typeof f === 'object')) {
      throw new Error('createSFFileBatch requires an array of file objects.');
    }

    return this._send({
      type: 'createSFFileBatch',
      data: files
    });
  }

  /**
   * @typedef {object} SFFilePathInput
   * @property {string} ParentId - Salesforce Id of the parent record
   * @property {string} FilePath - Path to the local file on the device
   * @property {string} [Name] - Desired file name (defaults to filename from path)
   * @property {string} [ContentType] - MIME type (e.g., "image/jpeg")
   * @property {string} [Description] - Optional file description
   * @property {string} [NetworkId] - Experience Cloud (Community) Network Id
   * @property {any} [custom] - Any additional custom fields supported by your org
  */

  /**
   * Creates multiple Salesforce Files (ContentDocuments) from local device file paths in a single batch.
   *
   * Each entry in the input array must specify:
   * - `ParentId` (string): Salesforce Id of the parent record
   * - `FilePath` (string): Path to the local file on the device
   *
   * Optional per entry:
   * - `Name` (string): Desired file name (defaults to filename from path)
   * - `ContentType` (string): MIME type (e.g., "image/jpeg")
   * - `Description` (string): Optional file description
   * - `NetworkId` (string): Salesforce Experience Cloud (Community) Network Id
   * - Any custom fields
   *
   * On success, resolves with the full `createbatchResponse`, which includes:
   * - `summary` (object): High-level batch result summary:
   *     - `{ success: "TRUE" }` on full success
   *     - `{ success: "FALSE" }` if any files failed
   * - `results` (object): A mapping from numeric string indices to result objects.
   *     Each result includes:
   *     - `objectId` (string): The ContentDocument Id or a temporary object Id (e.g., "CURIUM_...") on success
   *     - `success` (string): Either `"TRUE"` or `"FALSE"`
   *     - `FileURL` (string, optional): Local file URL on success
   *     - `error` (string, optional): Error message if `success` is `"FALSE"`
   *
   * Example:
   * {
   *   summary: { success: "FALSE" },
   *   results: {
   *     "0": {
   *       objectId: "069xx0000001234",
   *       success: "TRUE",
   *       FileURL: "http://127.0.0.1:17014/datacache/File1.jpg"
   *     },
   *     "1": {
   *       success: "FALSE",
   *       error: "Missing required field: ParentId"
   *     }
   *   }
   * }

   *
   * @param {Array<SFFilePathInput>} files - Array of files to upload from local paths
   * @returns {Promise<CreateSFFileBatchResponse>} - Batch result object with summary and results
   * @throws {Error} If the bridge is uninitialized or input is invalid
   */
  async createSFFileFromFilePathBatch(files) {

    if (!Array.isArray(files) || files.length === 0 || !files.every(f => typeof f === 'object')) {
      throw new Error('createSFFileFromFilePathBatch requires an array of file objects.');
    }

    return this._send({
      type: 'createSFFileFromFilePathBatch',
      data: files
    });
  }


  /**
   * @typedef {object} SFFileReadResult
   * @property {string} FileURL - Local device URL to the full file (always present)
   * @property {string} [VersionData] - Base64-encoded file contents (included if ReturnBase64Data is true)
   * @property {string} [ThumbBody] - Base64-encoded thumbnail image (for image files, if ReturnBase64Data is true)
   * @property {string} [ThumbURL] - Local device URL to the thumbnail (empty string if not available)
   * @property {any} [custom] - Any additional fields from the ContentVersion record
  */

  /**
   * Reads a single Salesforce File (ContentDocument or ContentVersion) by Id.
   *
   * This method returns an array containing one object representing the requested ContentVersion record.
   * The object includes metadata and optionally base64-encoded file content and thumbnails.
   *
   * Returned promise yields an array with objects with fields that include:
   * - `VersionData` (string, optional): Base64-encoded file contents (if ReturnBase64Data is true).
   * - `ThumbBody` (string, optional): Base64-encoded thumbnail (only for image files and if ReturnBase64Data is true).
   * - `FileURL` (string): Local device URL to the full file (always included).
   * - `ThumbURL` (string): Local device URL to the thumbnail (empty if not an image).
   *
   * @param {string} fileId - The Salesforce Id of the ContentDocument or ContentVersion record to retrieve.
   * @param {boolean} [returnBase64Data=false] - If true, includes `VersionData` and `ThumbBody` in the response.
   * @param {boolean} [downloadVersionData=true] - If true and online, Pulsar will download the latest file version from Salesforce.
   * @returns {Promise<SFFileReadResult[]>} A Promise resolving to an array with a single File object.
   * @throws {Error} If the bridge is uninitialized or the fileId is invalid.
  */
  async readSFFile(fileId, returnBase64Data = false, downloadVersionData = true) {

    if (!fileId || typeof fileId !== 'string') {
      throw new Error('readSFFile requires a valid fileId string.');
    }

    return this._send({
      type: 'readSFFile',
      data: {
        Id: fileId,
        ReturnBase64Data: returnBase64Data,
        DownloadVersionData: downloadVersionData
      }
    });
  }


  /**
   * Executes a raw SQLite update query on Pulsar's local database.
   *
   * This method allows direct manipulation of cached Salesforce data in Pulsar using SQLite syntax.
   * It bypasses standard validation and should be used with caution.
   *
   * @param {string} objectName - The name of the Salesforce SObject to update (e.g., 'Account').
   * @param {string} query - A raw SQLite UPDATE query string (e.g., "UPDATE Account SET Status__c = 'Active' WHERE Type = 'Customer'").
   * @returns {Promise<object>} - The response from the local database update, typically `{ data: 'success' }` or includes error info.
   * @throws {Error} If the bridge is uninitialized or inputs are invalid.
  */
  async updateQuery(objectName, query) {

    if (!objectName || typeof objectName !== 'string') {
      throw new Error('updateQuery requires a valid objectName string.');
    }
    if (!query || typeof query !== 'string') {
      throw new Error('updateQuery requires a valid SQLite query string.');
    }

    return this._send({
      type: 'updateQuery',
      object: objectName,
      data: {
        query
      }
    });
  }

  /**
   * @typedef {object} DeleteSFFileBatchResult
   * @property {string} success - `"TRUE"` or `"FALSE"`
   * @property {string} [objectId] - The ContentDocument Id or a temporary object Id (e.g., "CURIUM_...")
   * @property {string} [error] - Error message if `success` is `"FALSE"`
  */

  /**
   * @typedef {object} DeleteSFFileBatchResponse
   * @property {{ success: "TRUE" | "FALSE" }} summary - Overall success status of the batch
   * @property {Object.<string, DeleteSFFileBatchResult>} results - Result for each file, keyed by record Id
  */

  /**
   * Deletes multiple Salesforce records in a single request.
   *
   * This method performs a batch delete operation for the specified object using an array of record Ids.
   * The method returns a result summary and individual success/error details per record.
   *
   * @param {string} objectName - Name of the SObject (e.g., 'Account', 'Contact').
   * @param {string[]} idList - Array of Salesforce record Ids to delete.
   * @returns {Promise<DeleteSFFileBatchResponse>} - An object with a `summary` and a `results` map.
   * @throws {Error} If the bridge is uninitialized or inputs are invalid.
   */
  async deleteBatch(objectName, idList) {

    if (!objectName || typeof objectName !== 'string') {
      throw new Error('deleteBatch requires a valid objectName string.');
    }
    if (!Array.isArray(idList) || idList.length === 0 || !idList.every(id => typeof id === 'string')) {
      throw new Error('deleteBatch requires a non-empty array of string Ids.');
    }

    return this._send({
      type: 'deletebatch',
      object: objectName,
      data: {
        objectIdList: idList
      }
    });
  }



  /**
   * @typedef {Object} QueryContentResult
   * @property {string} FileURL - Local device URL to the full file.
   * @property {string} ThumbURL - Local device URL to the thumbnail (empty string if not an image).
   * @property {string} FilePath - Local relative or absolute path to the file.
   * @property {string} ThumbPath - Local relative or absolute path to the thumbnail.
  */

  /**
   * Queries the local Salesforce Files (ContentVersion table) for matching records.
   *
   * This API returns an array of file metadata objects matching the specified SQLite filter.
   * The filter applies to ContentVersion records only, and returns local file URLs but not file data.
   *
   * Returned object fields include:
   * - `FileURL` (string): Local device URL to the full file
   * - `ThumbURL` (string): Local device URL to the thumbnail (empty string if not an image)
   * - `FilePath` (string): Local relative or absolute path to the file
   * - `ThumbPath` (string): Local relative or absolute path to the thumbnail
   *
   * @param {string} filter - SQLite WHERE clause filter for ContentVersion (e.g., "ContentDocumentId = '069xx0000001234'")
   * @param {boolean} [downloadVersionData=true] - If true and online, Pulsar will download the latest file versions from Salesforce.
   * @returns {Promise<QueryContentResult[]>} - Array of ContentVersion metadata objects
   * @throws {Error} If the bridge is uninitialized or the filter is invalid
   */
  async queryContent(filter, downloadVersionData = true) {

    if (!filter || typeof filter !== 'string') {
      throw new Error('queryContent requires a valid SQLite filter string.');
    }

    return this._send({
      type: 'queryContent',
      data: {
        filter,
        DownloadVersionData: downloadVersionData
      }
    });
  }


  /**
   * Deletes one or more Salesforce Files (ContentDocuments).
   *
   * This method deletes Salesforce Files by providing an array of ContentDocument Ids.
   * On success, returns true if deletion completed successfully.
   *
   * @param {string[]} documentIdList - Array of Salesforce ContentDocument Ids to delete (e.g., ["069abc123456789"]).
   * @returns {Promise<boolean>} - Resolves true if successful
   * @throws {Error} If the bridge is uninitialized, the list is invalid, or an error occurs
   */
  async deleteSFFile(documentIdList) {

    if (!Array.isArray(documentIdList) || documentIdList.length === 0 || !documentIdList.every(id => typeof id === 'string')) {
      throw new Error('deleteSFFile requires an array of valid ContentDocument Id strings.');
    }

    const response = await this._send({
      type: 'deleteSFFile',
      data: {
        documentIdList
      }
    });

    if (typeof response === 'object' && response !== null && response.success === true) {
      return true;
    }

    // Some older versions or non-standard responses
    if (typeof response === 'string' && response.toLowerCase() === 'success') {
      return true;
    }

    throw new Error('Unexpected response from deleteSFFile.');
  }


  /**
   * Retrieves Chatter feed items related to a specific parent Salesforce record.
   *
   * This method returns an array of FeedItem objects for the given ParentId.
   * Optional filters include date boundaries and sort order.
   *
   * Some of the commonly used fields on FeedItem are: Body, Title, CommentCount, LikeCount, ParentId, RelatedRecordId, and Attachments.
   *
   * @param {string} parentId - Salesforce Id of the parent object (e.g., Account, WorkOrder).
   * @param {object} [options={}] - Optional filter parameters:
   *   @param {string} [options.afterDate] - ISO 8601 timestamp to filter feed items created after this date.
   *   @param {string} [options.beforeDate] - ISO 8601 timestamp to filter feed items created before this date.
   *   @param {string} [options.orderBy] - Order by clause (e.g., "CreatedDate ASC").
   * @returns {Promise<object[]>} - Array of Chatter FeedItem objects.
   * @throws {Error} If the bridge is uninitialized or input is invalid.
   */
  async chatterGetFeed(parentId, options = {}) {

    if (!parentId || typeof parentId !== 'string') {
      throw new Error('chatterGetFeed requires a valid parentId string.');
    }

    const { afterDate, beforeDate, orderBy } = options;

    const requestData = {
      ParentId: parentId,
      ...(afterDate && { '@@after_date': afterDate }),
      ...(beforeDate && { '@@before_date': beforeDate }),
      ...(orderBy && { orderBy })
    };

    const response = await this._send({
      type: 'chattergetfeed',
      data: requestData
    });

    if (!Array.isArray(response)) {
      throw new Error('Unexpected response from chatterGetFeed. Expected an array of FeedItem objects.');
    }

    return response;
  }


  /**
   * Posts a new Chatter feed item or comment to a Salesforce record.
   *
   * If `parentFeedItemId` is provided, the post is treated as a comment.
   *
   * @param {string} message - The message to post.
   * @param {string} parentId - Salesforce Id of the object (e.g., Account) to post to.
   * @param {string} [parentFeedItemId] - Optional Id of the parent feed item to post a comment on.
   * @returns {Promise<void>}
   * @throws {Error} If the bridge is not initialized or inputs are invalid.
   */
  async chatterPostFeed(message, parentId, parentFeedItemId) {

    if (!message || typeof message !== 'string' || !parentId || typeof parentId !== 'string') {
      throw new Error('chatterPostFeed requires a message and parentId.');
    }

    const data = {
      Message: message,
      Parent: parentId,
      ...(parentFeedItemId && { ParentFeedItem: parentFeedItemId })
    };

    const response = await this._send({
      type: 'chatterpostfeed',
      data
    });

    // Success returns no data, error throws in _send
    if (response !== null && typeof response !== 'undefined') {
      // Optional: validate that response is not of unexpected form
      return;
    }
  }


  /**
   * @typedef {object} GetSettingResponse
   * @property {"TRUE" | "FALSE"} Exists - Whether the requested Pulsar Setting key exists
   * @property {any} [key] - The setting value under the key name that was passed into the request.
   *                         This key will be dynamic and match the input string.
  */

  /**
   * Retrieves a named Pulsar Setting from the configuration table.
   *
   * @param {string} key - The key of the Pulsar Setting to retrieve.
   * @returns {Promise<GetSettingResponse>} - An object with the keys "Exists" and the setting key which maps to the setting value.
   * @throws {Error} If the key is missing or the request fails.
   */
  async getSetting(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('getSetting requires a valid key string.');
    }

    return this._send({
      type: 'getSetting',
      data: { key }
    });
  }


  /**
   * @typedef {object} GetSettingAttachmentResponse
   * @property {string} FileName - Pathless file name of the setting attachment
   * @property {string} FilePath - Full local path to the setting attachment
   * @property {any} key - The setting key containing this attachment.
  */

  /**
   * Retrieves a Pulsar Setting attachment by key.
   *
   * The response includes the file name, full file path, and the content associated with the setting key.
   *
   * @param {string} key - The Pulsar Setting key to retrieve as an attachment.
   * @returns {Promise<GetSettingAttachmentResponse>} - A dictionary with FileName, FilePath, key which includes the key that was used to get this content.
   * @throws {Error} If the bridge is uninitialized or the setting is missing.
   *
   * Example:
   * ```
   * const result = await pulsar.getSettingAttachment('pulsar.test.getSettingAttachment');
   * console.log(result.FileName); // e.g., 'example.pdf'
   * console.log(result.FileURL);  // e.g., 'file:///storage/.../example.pdf'
   * ```
   */
  async getSettingAttachment(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('getSettingAttachment requires a valid key string.');
    }

    return this._send({
      type: 'getSettingAttachment',
      data: { key }
    });
  }


  /**
   * @typedef {Object} GetContentUrlResult
   * @property {string} url - The URL to the desired document.
   * @property {string} title - The title of the desired document.
  */

  /**
   * Retrieves a local offline-accessible URL for a Content Library file.
   *
   * You must provide either the Salesforce ContentDocument Id or the Title of the document.
   * The returned URL can be loaded directly in the browser, including PDFs, images, videos, or HTML files.
   *
   * ⚠️ Note: The returned URL may include query parameters required by Pulsar. Do not modify or discard them.
   *
   * @param {object} params - Parameters to locate the content.
   * @param {string} [params.Id] - Salesforce ContentDocument Id (e.g., '069xx0000001234').
   * @param {string} [params.Title] - Title of the document (e.g., 'Safety Guide').
   * @returns {Promise<GetContentUrlResult>} - Resolves with an object containing `url` and `title`.
   * @throws {Error} If neither Id nor Title is provided, or the bridge is uninitialized.
   */
  async getContentUrl({ Id, Title }) {

    if (!Id && !Title) {
      throw new Error('getContentUrl requires at least one of Id or Title.');
    }

    return this._send({
      type: 'getContentUrl',
      data: {
        ...(Id && { Id }),
        ...(Title && { Title })
      }
    });
  }


  /**
   * Retrieves Pulsar's current auto-sync status.
   *
   * Returns the string 'TRUE' if auto-sync is enabled, or 'FALSE' if disabled.
   *
   * @returns {Promise<string>} - 'TRUE' or 'FALSE' indicating auto-sync status.
   * @throws {Error} If the bridge is uninitialized or the request fails.
  */
  async getAutosyncStatus() {

    return this._send({
      type: 'getAutosyncStatus',
      data: {}
    });
  }


  /**
   * Sets Pulsar's auto-sync status.
   *
   * @param {boolean|string} enable - Pass `true` or `'TRUE'` to enable, `false` or `'FALSE'` to disable.
   * @returns {Promise<string>} - 'TRUE' or 'FALSE' indicating final status after attempt.
   * @throws {Error} If the bridge is uninitialized or input is invalid.
  */
  async setAutosyncStatus(enable) {

    const statusString = enable === true || enable === 'TRUE' ? 'TRUE' : 'FALSE';

    return this._send({
      type: 'setAutosyncStatus',
      data: statusString
    });
  }


  /**
   * @typedef {Object} UserPhotoResult
   * @property {string} smallphoto - The URL to a thumbnail version of the user photo.
   * @property {string} fullphoto - The URL to the full sized user photo.
  */

  /**
   * Retrieves the current user's photo URLs.
   *
   * Returns an object with the following shape:
   * {
   *   smallphoto: string, // URL for small photo
   *   fullphoto: string   // URL for full-size photo
   * }
   *
   * @returns {Promise<UserPhotoResult>}
  */
  async userPhoto() {
    return this._send({
      type: 'userPhoto',
      data: {}
    });
  }


  /**
   * Returns whether the local development server is enabled.
   *
   * @param {string} [docId] - Optional document Id.
   * @returns {Promise<string>} "TRUE" or "FALSE"
  */
  async getDevServerEnabled(docId) {
    return this._send({
      type: 'getDevServerEnabled',
      args: docId ? { docId } : {},
      data: {}
    });
  }


  /**
   * Retrieves the current platform (e.g., "windows", "android", "ios").
   *
   * @returns {Promise<string>} Platform string.
  */
  async getPlatform() {
    return this._send({
      type: 'getPlatform',
      data: {}
    });
  }


  /**
   * @typedef {Object} LocationResult
   * @property {string} longitude - A string representation of the users current longitude.
   * @property {string} latitude - A string representation of the users current latitude.
   * @property {string} locationAccuracy - A string representation of the accuracy of this location.
   */

  /**
   * Retrieves the device's current location coordinates.
   *
   * @param {string} [locationAccuracy="Medium"] - Accuracy level: "Fine", "Medium", or "Coarse".
   * @returns {Promise<LocationResult>} An object with `longitude`, `latitude`, and `locationAccuracy`.
  */
  async getLocation(locationAccuracy = 'Medium') {
    return this._send({
      type: 'getLocation',
      data: { locationAccuracy }
    });
  }


  /**
   * Retrieves Salesforce Custom Labels from the Pulsar Settings store.
   *
   * @param {string[]} labelNames - List of custom label names to retrieve.
   * @param {string} [locale] - Optional locale (e.g., "es_MX").
   * @returns {Promise<object>} Object with label name/value pairs.
  */
  async getCustomLabels(labelNames, locale) {
    if (!Array.isArray(labelNames) || labelNames.length === 0) {
      throw new Error('getCustomLabels requires a non-empty labelNames array.');
    }
    return this._send({
      type: 'getCustomLabels',
      data: {
        labelNames,
        ...(locale && { locale })
      }
    });
  }


  /**
   * Logs a message to the Pulsar log.
   *
   * @param {string} message - The message to log.
   * @param {string} [level="info"] - Optional log level: "info", "warn", "error", "debug", or "Verbose".
   * @returns {Promise<void>} Resolves if logging succeeds.
  */
  async logMessage(message, level = 'info') {
    if (!message || typeof message !== 'string') {
      throw new Error('logMessage requires a valid message string.');
    }

    return this._send({
      type: 'logMessage',
      data: {
        message,
        level
      }
    });
  }

  /**
   * @typedef {Object} GetFSLTemplateResponse
   * @property {ServiceReportTemplate[]} serviceReportTemplates - An array of ServiceReportTemplate
  */

  /**
   * @typedef {Object} ServiceReportTemplate
   * @property {boolean} defaultTemplate - `true` if this is the default template for this organization, `false` otherwise
   * @property {any} error - Unknown usage.
   * @property {string} language - The language used for this service report expressed as a locale, e.g. `"en_US"`
   * @property {string} templateId - The `Id` of this service report template.
   * @property {ServiceReportSubTemplate[]} subTemplates - An array of ServiceReportSubTemplates.
  */

  /**
   * @typedef {Object} ServiceReportSubTemplate
   * @property {string} subTemplateType - One of: "WorkOrder", "WorkOrderLineItem", "WO_SA" or "WOLI_SA" defining which type of sub template this is.
   * @property {SubTemplateRegion[]} regions - An array of SubTemplateRegions.
  */

  /**
   * @typedef {Object} SubTemplateRegion
   * @property {ServiceReportSection[]} sections - An array of ServiceReportSections.
   * @property {"HEADER" | "FOOTER" | "BODY"} type - One of "HEADER", "FOOTER", or "BODY".
  */

  /**
   * Base type for all service report sections.
   * One of: `ServiceReportFieldSection`, `ServiceReportRelatedListSection`, or `ServiceReportSignatureSection`.
   *
   * @typedef {Object} ServiceReportSection
   * @property {number} position - The position of this section within the region from top to bottom.
   * @property {string} title - The title of this section.
  */

  /**
   * @typedef {ServiceReportSection} ServiceReportFieldSection
   * @property {"section"} type - The type of this section.
   * @property {ServiceReportItem[]} items - An array of ServiceReportItems that make up the columns and content of this section.
   * @property {number} columns - The number of columns for this section.
   * @property {boolean} hideFieldLabels - if `true` then field labels should be hidden in this section.
   * @property {boolean} hideTitle - if `true` then the title of this section should be hidden.
   * @property {boolean} rightAlign - When true, the contents of this section should be aligned to the right.
   */

  /**
   * @typedef {ServiceReportSection} ServiceReportRelatedListSection
   * @property {"relatedList"} type - The type of this section.
   * @property {ServiceReportRelatedListColumn[]} items - An array of ServiceReportRelatedListColumns that make up the columns and content of this section.
   * @property {string} entityName - Identifies the parent object type of this related list.
   * @property {FilterCriteria[]} filterCriteria - An array of filter operations applied to this related list.
   * @property {string} relatedEntityName - The object type of the related list items.
   * @property {string} relatedListName - The name of the related list.
   * @property {SortCriteria[]} sortCriteria - An array of sort criteria to be applied to the related list.
  */

  /**
   * @typedef {ServiceReportSection} ServiceReportSignatureSection
   * @property {"signature"} type - The type of this section.
   * @property {ServiceReportItem[]} items - An array of ServiceReportItems that make up the columns and content of this section.
   * @property {number} columns - The number of columns for this section.
   * @property {string} [signatureType] - Required when the type is "signature". Defines the type of signature.
   * @property {string} [signatureTypeLabel] - Required when the type is "signature". The label to display for this signature capture section.
   * @property {boolean} rightAlign - When true, the contents of this section should be aligned to the right.
   * @property {boolean} hideFieldLabels - if `true` then field labels should be hidden in this section.
   * @property {boolean} hideTitle - if `true` then the title of this section should be hidden.
  */

  /**
   * @typedef {Object} FilterCriteria
   * @property {string} field - The name of the field to filter on
   * @property {string} operation - a SOQL filtering operation, one of: "includes", "equals", "excludes", "notEqual", "not equal to"
   * @property {number} position - The order in which to apply the filter
   * @property {string} values - The values to use in the operation
  */

  /**
   * @typedef {Object} SortCriteria
   * @property {string} field - The field on which to apply this sort.
   * @property {boolean} isAscending - Whether or not this field should be sorted in ascending order.
   * @property {number} position - The order in which to apply this sort criteria.
   */

  /**
   * Base type for all service report items.
   *
   * @typedef {Object} ServiceReportItem
   * @property {string} label - The default label to use for this item.
   * @property {string} name - The name of the field on the source of this item that will be displayed.
   * @property {Object} otherLabels - A map from ISO-639 abbreviation for a language to the label to use for that language.
  */

  /**
   * @typedef {ServiceReportItem} ServiceReportRelatedListColumn
   * @property {string} column - The zero-indexed column number ordered from left to right.
  */

  /**
   * @typedef {ServiceReportItem} ServiceReportEntityFieldItem
   * @property {"entityField"} type - The type of this ServiceReportItem. Used to discriminate between other ServiceReportItems types.
   * @property {string} entityName - The object type that is the source of this item.
   * @property {ServiceReportItemPosition} position - An object describing the row and col positioning in this section.
  */

  /**
   * @typedef {ServiceReportItem} ServiceReportRichTextAreaItem
   * @property {"rta"} type - The type of this ServiceReportItem. Used to discriminate between other ServiceReportItems types.
   * @property {string} richText - Required when type is "rta". Indicates the value to display in the rich text area.
  */

  /**
   * @typedef {ServiceReportItem} ServiceReportBlankItem
   * @property {"blank"} type - The type of this ServiceReportItem. Used to discriminate between other ServiceReportItems types.
  */

  /**
   * @typedef {Object} ServiceReportItemPosition
   * @property {number} row - The row index for the position of an item.
   * @property {number} col - The column index for the position of an item.
   */

  /**
   * Retrieves Service Report template metadata from Field Service Lightning (FSL).
   *
   * This request operates in two modes depending on the provided arguments:
   *
   * - With no arguments: returns a dictionary of Service Report template names to their Ids.
   * - With one or both arguments: returns the corresponding Service Report Template metadata.
   *   If both are provided, `templateId` takes precedence.
   *
   * ⚠️ This API requires Field Service Sync to be enabled in the current Pulsar context.
   *
   * @param {string} [templateId] - Optional. The Id of the Service Report Template.
   * @param {string} [templateName] - Optional. The name of the Service Report Template.
   * @returns {Promise<GetFSLTemplateResponse>} - The `data` from a `GetFSLTemplateResponse`.
   *
   * @example
   * const list = await pulsar.getFSLTemplate();
   * const byId = await pulsar.getFSLTemplate("0TTxx0000000001");
   * const byName = await pulsar.getFSLTemplate(undefined, "Report Template A");
  */
  async getFSLTemplate(templateId, templateName) {
    const data = {};
    if (typeof templateId === 'string') {
      data.TemplateId = templateId;
    } else if (typeof templateName === 'string') {
      data.TemplateName = templateName;
    }

    return this._send({
      type: 'getfsltemplate',
      data
    });
  }


  /**
   * Executes a Field Service Mobile Flow by name or version Id.
   *
   * This opens the native Flow UI window, allowing the user to step through
   * screens configured by Salesforce admins. Only Flows of type "Field Service Mobile Flow"
   * are supported and must be synced through the Pulsar Settings screen.
   *
   * ⚠️ This feature requires Field Service Lightning to be enabled and updated flow metadata to be synced.
   *
   * @param {string} [flowName] - The API name of the Flow to run (required if flowId is omitted).
   * @param {string} [flowId] - The version Id of the Flow to run (required if flowName is omitted).
   * @param {string} [actionLabel] - Optional user-facing label for the Flow presentation.
   * @param {string} [id] - Optional record Id the Flow is launched from.
   * @param {string} [userId] - Optional User Id (defaults to current user if omitted).
   * @param {string} [parentId] - Optional parent record Id (e.g., Work Order Id).
   * @returns {Promise<object>} - The raw `executefslflowResponse` object returned by the bridge.
   *
   * @example
   * const result = await pulsar.executeFSLFlow(
   *   'Sales_Funnel_Flow1',
   *   undefined,
   *   'Pre-sale Form Flow',
   *   '08p23456789ABCDEFG',
   *   undefined,
   *   '0WO23456789ABCDEFG'
   * );
   * console.log(result.executed); // true if Flow was shown
  */
  async executeFSLFlow(flowName, flowId, actionLabel, id, userId, parentId) {
    if (!flowName && !flowId) {
      throw new Error('executeFSLFlow requires either flowName or flowId.');
    }

    return this._send({
      type: 'executeFSLFlow',
      data: {
        ...(flowId && { FlowId: flowId }),
        ...(flowName && { FlowName: flowName }),
        ...(actionLabel && { ActionLabel: actionLabel }),
        ...(id && { Id: id }),
        ...(userId && { UserId: userId }),
        ...(parentId && { ParentId: parentId })
      }
    });
  }


  /**
   * Creates a Service Report from a local file path and associates it to a parent Salesforce record.
   *
   * This method is typically used in conjunction with `saveAs` to export a report file locally,
   * then attach it to a record in Salesforce using the selected Service Report Template.
   *
   * @param {string} parentId - The Salesforce Id of the parent object (e.g., Account, WorkOrder).
   * @param {string} filePath - The full local path to the file (e.g., returned by `saveAs`).
   * @param {string} templateId - The Id of the Service Report Template used to generate this report.
   * @param {string} documentName - The desired file name for the uploaded document (e.g., "report.pdf").
   * @param {string} contentType - The MIME type of the file (e.g., "application/pdf").
   * @returns {Promise<string>} - Resolves with the Id of the newly created ServiceReport.
   *
   * @example
   * const filePath = await pulsar.saveAs({ filename: "report.pdf" });
   * const reportId = await pulsar.createServiceReportFromFilePath(
   *   "001234567890123",
   *   filePath,
   *   "000234567890123",
   *   "report.pdf",
   *   "application/pdf"
   * );
  */
  async createServiceReportFromFilePath(parentId, filePath, templateId, documentName, contentType) {
    if (!parentId || typeof parentId !== 'string') {
      throw new Error('createServiceReportFromFilePath requires a valid parentId string.');
    }
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('createServiceReportFromFilePath requires a valid filePath string.');
    }
    if (!templateId || typeof templateId !== 'string') {
      throw new Error('createServiceReportFromFilePath requires a valid templateId string.');
    }
    if (!documentName || typeof documentName !== 'string') {
      throw new Error('createServiceReportFromFilePath requires a valid documentName string.');
    }
    if (!contentType || typeof contentType !== 'string') {
      throw new Error('createServiceReportFromFilePath requires a valid contentType string.');
    }

    return this._send({
      type: 'createservicereportfromfilepath',
      data: {
        ParentId: parentId,
        FilePath: filePath,
        TemplateId: templateId,
        DocumentName: documentName,
        ContentType: contentType
      }
    });
  }



  /**
   * A dictionary of Listview labels indexed by Listview Ids.
   *
   * @typedef {Object.<string, string>} ListviewLabelMap
   * @example
   * {
   *   "00Bxx0000001abc": "All Accounts",
   *   "00Bxx0000001def": "My New Accounts"
   * }
  */

  /**
   * Retrieves a dictionary of Salesforce Listview labels and their Ids for a given SObject.
   *
   * This method returns an object where each key is a Listview Id and the value is the label.
   * Typically used to allow selection of available Listviews for a given object. The keys of the returned
   * object can be used with pulsar.listviewMetadata(objectName, listviewId) to retrieve the listview metadata
   * or with pulsar.viewList(objectName, listviewId) to display the listview to the user and allow them to select
   * an object from it.
   *
   * @param {string} objectName - (required) The API name of the Salesforce SObject (e.g., 'Account').
   * @returns {Promise<ListviewLabelMap>} - A dictionary of Listview Labels indexed by their Ids.
   * @throws {Error} If the bridge is uninitialized or the objectName is invalid.
  */
  async listviewInfo(objectName) {
    if (!objectName || typeof objectName !== 'string') {
      throw new Error('listviewInfo requires a valid objectName string.');
    }

    return this._send({
      type: 'listviewInfo',
      object: objectName,
      data: {} // currently no additional parameters supported
    });
  }

  /**
   * Navigates to a list view for a given Salesforce SObject.
   *
   * @param {string} objectName - The API name of the Salesforce object (e.g., 'Account').
   * @param {string} listViewId - The ID of the list view to open (e.g., from pulsar.listviewInfo()). Listview IDs can be obtained from pulsar.listviewInfo(objectName).
   * @returns {Promise<void>} Resolves when the action has been initiated.
   *
   * @example
   * const listViews = await pulsar.listviewInfo('Account');
   * const allListViewEntry = Object.entries(listViews).find(
   *  ([_, label]) => label === 'All Accounts'
   * );
   *
   * if (!allListViewEntry) {
   *  throw new Error('ListView "All Accounts" not found.');
   * }
   *
   * const listviewId = allListViewEntry[0];
   *
   * await pulsar.viewList('Account', listviewId);
   *
  */
  async viewList(objectName, listViewId) {
    return this._send({
      type: 'viewList',
      object: objectName,
      data: { listViewId }
    });
  }

  /**
   * @typedef {Object} ListviewLayout
   * @property {string[]} fields - The API names of fields shown as columns.
   * @property {string[]} labels - The display labels for the columns.
   * @property {string[]} filters - SQLite-compatible filter clauses applied to the data.
   * @property {string} whereClause - The WHERE clause representing the listview’s filtering logic.
   * @property {string} orderBy - The ORDER BY clause used to sort the results.
   * @property {string} listId - The Id of the listview this metadata describes.
  */

  /**
   * Returns layout metadata **specific to listview rendering**, not full SObject metadata.
   *
   * Unlike `describe` or other metadata methods, this result only contains display-specific configuration:
   * visible fields, labels, and filter/sort SQL clauses.
   *
   * To display a listview, use this method after obtaining a `listviewId` via {@link listviewInfo}.
   *
   * @param {string} objectName - The API name of the SObject (e.g., `"Account"`).
   * @param {string} listviewId - The unique ID of the listview to retrieve metadata for.
   * @returns {Promise<ListviewLayout>} A promise resolving to a layout spec for listview rendering.
   *
   * @throws {Error} If `objectName` or `listviewId` are missing or not strings.
   *
   * @example
   * const listviews = await pulsar.listviewInfo('Account');
   * const listviewId = Object.entries(listviews).find(([, label]) => label === 'All Accounts')?.[0];
   * const listviewLayout = await pulsar.listviewMetadata('Account', listviewId);
   * console.log(listviewLayout.fields); // e.g., ['Name', 'Industry', 'OwnerId']
  */
  async listviewMetadata(objectName, listviewId) {
    if (!objectName || typeof objectName !== 'string') {
      throw new Error('listviewMetadata requires a valid objectName string.');
    }
    if (!listviewId || typeof listviewId !== 'string') {
      throw new Error('listviewMetadata requires a valid listviewId string.');
    }

    return this._send({
      type: 'listviewmetadata',
      object: objectName,
      data: { 'listviewid': listviewId }
    });
  }



  /**
   * Displays a confirmation prompt when the user attempts to leave the page.
   * Call with an empty string to disable.
   * @param {string} message - The confirmation message to display.
   * @returns {Promise<void>}
  */
  async setLeavePageMessage(message) {
    return this._send({
      type: 'setLeavePageMessage',
      object: '',
      data: message || ''
    });
  }

  /**
   * Closes the current HTML document (acts like pressing Done).
   * @returns {Promise<void>}
  */
  async exit() {
    return this._send({
      type: 'exit',
      data: {}
    });
  }

  /**
   * Opens the Pulsar native create screen for the given SObject.
   * @param {string} objectName - Salesforce object API name.
   * @param {object} fields - Fields and default values to prefill.
   * @returns {Promise<object>} - Response includes createResult and createId.
  */
  async showCreate(objectName, fields = {}) {
    return this._send({
      type: 'showCreate',
      object: objectName,
      data: fields
    });
  }

  /**
   * Opens a Salesforce object record in view or edit mode.
   *
   * @param {string} objectName - The Salesforce object type (e.g., "Account").
   * @param {string} Id - The record Id of the object to view.
   * @param {string} [editmode='FALSE'] - Whether to open in edit mode or not, "FALSE" is the default.
   * @returns {Promise<object>} - Response from the platform UI.
  */
  async viewObject(objectName, Id, editmode = 'FALSE') {
    if (!objectName || typeof objectName !== 'string') {
      throw new Error('viewObject requires a valid objectName string.');
    }
    if (!Id || typeof Id !== 'string') {
      throw new Error('viewObject requires a valid Id string.');
    }

    return this._send({
      type: 'viewObject',
      object: objectName,
      data: {
        Id,
        editmode
      }
    });
  }


  /**
   * Opens a related list for a parent Salesforce object.
   *
   * @param {string} objectName - The Salesforce object type of the parent (e.g., "Account").
   * @param {string} parentId - The Id of the parent record.
   * @param {string} relationshipName - The API name of the relationship (e.g., "Contacts").
   * @returns {Promise<object>} - Response from the platform UI.
  */
  async viewRelated(objectName, parentId, relationshipName) {
    if (!objectName || typeof objectName !== 'string') {
      throw new Error('viewRelated requires a valid objectName string.');
    }
    if (!parentId || typeof parentId !== 'string') {
      throw new Error('viewRelated requires a valid parentId string.');
    }
    if (!relationshipName || typeof relationshipName !== 'string') {
      throw new Error('viewRelated requires a valid relationshipName string.');
    }

    return this._send({
      type: 'viewRelated',
      object: objectName,
      data: {
        parentId,
        relationshipName
      }
    });
  }

  /**
   * Allows the user to select one or more records from a filtered or listview-based selection screen.
   * @param {string} objectName - The object API name (e.g., "Account").
   * @param {object} data - Optional filter criteria or Listview key.
   * @returns {Promise<object[]>} - Array of selected SObject records.
   *
   * ⚠️ WARNING: This returns an array of selected objects. Even if you expect only one selection,
   * always destructure the array (e.g., const [selected] = await pulsar.lookupObject(...);).
   *
   * @example
   * const [selected] = await pulsar.lookupObject("Contact", { filter: "Active" });
   * const contactId = selected?.Id;
  */
  async lookupObject(objectName, data = {}) {
    return this._send({
      type: 'lookupObject',
      object: objectName,
      data
    });
  }

  /**
   * Opens the device barcode scanner and returns scanned value.
   * @returns {Promise<string>} - Contains the scanned barcode string.
   */
  async scanBarcode() {
    return this._send({
      type: 'scanBarcode',
      data: {}
    }).then( response => response['barcode'] );
  }

  /**
   * Launches a Quick Action by API name.
   * @param {string} ActionName - Salesforce API name of the Quick Action.
   * @param {string} [contextId] - Optional context record Id.
   * @param {object} [fields={}] - Default field values.
   * @returns {Promise<object>} - Contains executed and quickActionResult flags.
  */
  async executeQuickAction(ActionName, contextId, fields = {}) {
    return this._send({
      type: 'executeQuickAction',
      data: {
        ActionName,
        ...(contextId && { ContextId: contextId }),
        ...fields
      }
    });
  }


  /**
   * Metadata describing a photo file selected from the device gallery.
   * Used as the return type for `pulsar.cameraPhoto()` and `pulsar.cameraPhotoPicker()`.
   * @typedef {Object} PhotoFileMetadata
   * @property {string} ContentType - The MIME type of the photo (e.g., 'image/jpeg').
   * @property {string} FileName - The name of the file (e.g., 'photo.jpg').
   * @property {string} FilePath - The absolute file path on the device.
   * @property {string} FileURL - A URL reference to the file.
   * @property {string} RelativeFilePath - A file path relative to the app’s root, if available.
  */

  /**
   * Opens the device camera to capture a photo.
   * @param {string} [quality='medium'] - Photo quality: "high", "medium", or "low".
   * @returns {Promise<PhotoFileMetadata>} - Promise resolving to a photo file metadata object.
  */
  async cameraPhoto(quality = 'medium') {
    return this._send({
      type: 'cameraPhoto',
      data: { quality }
    });
  }


  /**
   * Opens the device gallery to pick photos.
   * @returns {Promise<PhotoFileMetadata[]>} - Promise resolving to an array of photo file metadata objects.
   */
  async cameraPhotoPicker() {
    return this._send({
      type: 'cameraPhotoPicker',
      data: {}
    });
  }


  /**
   * Opens the file picker dialog for arbitrary file selection.
   * @returns {Promise<object[]>} - Array of file metadata objects.
  */
  async filePicker() {
    return this._send({
      type: 'filePicker',
      data: {}
    });
  }

  /**
   * Opens a specified URL in Pulsar's embedded browser or external browser.
   * @param {object} options - URL options.
   * @param {string} [options.fullUrl] - Full URL to open.
   * @param {boolean} [options.externalBrowser=false] - Whether to open in external browser.
   * @param {string} [options.scheme] - URL scheme (e.g., 'https://').
   * @param {string} [options.path] - Path and host (e.g., 'example.com/path').
   * @param {object} [options.queryParams] - Query parameter key/value pairs.
   * @returns {Promise<object>} - Response from browser launch.
  */
  async displayUrl({ fullUrl, externalBrowser, scheme, path, queryParams } = {}) {
    return this._send({
      type: 'displayUrl',
      data: {
        ...(fullUrl && { fullUrl }),
        ...(externalBrowser !== undefined && { externalBrowser }),
        ...(scheme && { scheme }),
        ...(path && { path }),
        ...(queryParams && { queryParams })
      }
    });
  }


  /**
   * Retrieves the current online/offline status of the Pulsar client.
   *
   * @returns {Promise<object>} - A promise that resolves to an object with `online` set to `true` or `false`.
  */
  async getOnlineStatus() {
    return this._send({
      type: 'getOnlineStatus'
    }).then( result => { return result === 'TRUE'; });
  }

  /**
   * Sets the online/offline status of the Pulsar client.
   *
   * This allows simulation of offline mode for testing or operational purposes.
   *
   * @param {boolean} online - `true` to set online mode, `false` to go offline.
   * @returns {Promise<object>} - A promise that resolves to a status confirmation object.
   * @throws {Error} If the `online` parameter is not a boolean.
  */
  async setOnlineStatus(online) {
    if (typeof online !== 'boolean') {
      throw new Error('setOnlineStatus requires a boolean parameter.');
    }

    return this._send({
      type: 'setOnlineStatus',
      data: online ? 'TRUE' : 'FALSE'
    }).then( result => { return result === 'TRUE'; });
  }


  /**
   * Retrieves the current network connectivity status from the Pulsar runtime.
   *
   * @returns {Promise<object>} - A promise that resolves to an object with the following fields:
   *   @property {string} isConnected - `"TRUE"` if the device has network access, `"FALSE"` otherwise.
   *   @property {string} connectionType - The type of connection (e.g., `"wifi"`, `"cellular"`, `"none"`).
   *
   * @example
   * const status = await pulsar.getNetworkStatus();
   * if (status.isConnected === 'FALSE') {
   *   console.warn('Device has no network connection:', status.connectionType);
   * }
  */
  async getNetworkStatus() {
    return this._send({
      type: 'getNetworkStatus'
    });
  }


  /**
   * Retrieves filtered picklist values and labels for a specified field on a Salesforce object.
   *
   * This method returns only the picklist values currently valid for the given layout and
   * optional `RecordTypeId`. If the picklist is controlled by another field, you must provide a sample value
   * for the controlling field by passing the controlling field's API name and its selected value.
   *
   * @param {string} objectName - The API name of the SObject (e.g., 'Account').
   * @param {string} fieldName - The API name of the picklist field (e.g., 'Type').
   * @param {string} [recordTypeId] - Optional Salesforce Record Type Id.
   * @param {string} [controllerFieldName] - Optional API name of the controlling field (if applicable).
   * @param {string} [controllerFieldValue] - Optional value for the controlling field.
   * @returns {Promise<{ itemIds: string[], itemLabels: string[] }>} - The filtered picklist values and labels.
  */
  async getPicklist(objectName, fieldName, recordTypeId, controllerFieldName, controllerFieldValue) {
    const data = {
      ...(recordTypeId && { RecordTypeId: recordTypeId }),
      ...(controllerFieldName && controllerFieldValue && { [controllerFieldName]: controllerFieldValue })
    };

    return await this._send({
      type: 'getPicklist',
      object: objectName,
      fieldName,
      data
    });
  }


  /**
   * Retrieves all defined picklist values and labels for a specified field on a Salesforce object,
   * regardless of layout or controlling field visibility.
   *
   * This method is useful for administrative or general-purpose use cases where you need all
   * available picklist options, not just those visible on a layout.
   *
   * @param {string} objectName - The API name of the SObject (e.g., 'Account').
   * @param {string} fieldName - The API name of the picklist field (e.g., 'Type').
   * @param {string} [recordTypeId] - Optional Salesforce Record Type Id.
   * @returns {Promise<{ itemIds: string[], itemLabels: string[] }>} - The full picklist values and labels.
   * @throws {Error} If parameters are missing or invalid.
  */
  async getUnfilteredPicklist(objectName, fieldName, recordTypeId) {
    if (!objectName || typeof objectName !== 'string') {
      throw new Error('getUnfilteredPicklist requires a valid objectName string.');
    }
    if (!fieldName || typeof fieldName !== 'string') {
      throw new Error('getUnfilteredPicklist requires a valid fieldName string.');
    }

    return await this._send({
      type: 'getUnfilteredPicklist',
      object: objectName,
      fieldName,
      data: recordTypeId ? { RecordTypeId: recordTypeId } : {}
    });
  }



  /**
   * Opens a pre-populated draft email composer window.
   *
   * This method launches the device's native email client with fields like `to`, `cc`, `subject`, `body`,
   * and optional attachments prefilled. The user can modify and send the email manually.
   *
   * @param {string[]} [to] - Array of recipient email addresses.
   * @param {string[]} [cc] - Array of CC email addresses.
   * @param {string[]} [attach] - Array of file paths to attach.
   * @param {string} [subject] - Subject of the email.
   * @param {string} [body] - Body text of the email.
   * @returns {Promise<void>} Resolves when the email composer is successfully launched.
   * @throws {Error} If the bridge is uninitialized or input is invalid.
  */
  async mail(to, cc, attach, subject, body) {
    return this._send({
      type: 'mail',
      data: {
        ...(Array.isArray(to) && to.length && { to }),
        ...(Array.isArray(cc) && cc.length && { cc }),
        ...(Array.isArray(attach) && attach.length && { attach }),
        ...(typeof subject === 'string' && subject && { subject }),
        ...(typeof body === 'string' && body && { body }),
      }
    });
  }



  /** ******************************
   * PRIVATE INTERNAL METHODS
   ****************************** */

  /**
   * Internal method to send a Pulsar JSAPI request via the bridge
   * @param {object} request - Pulsar JSAPI request payload
   * @returns {Promise<object>} - Response data or error
   */
  _send(request) {
    return new Promise((resolve, reject) => {
      if (!this.bridge) return reject(new Error('Pulsar bridge not initialized. Call init() first.'));

      this.bridge.send(request, (response) => {
        if (response.type === 'error') {
          reject(new Error(response.data || 'Unknown Pulsar JSAPI error'));
        } else {
          resolve(response.data);
        }
      });
    });
  }
}
