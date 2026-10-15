// Both the binding handler and the bundled library are registered under a
// plugin specific name on purpose. Other plugins (e.g. OctoDash Companion) ship
// their own "iconpicker" binding and their own copy of the library with a
// different icon set; whichever loaded last used to win, and the bundled
// library even skipped its own registration when another copy was already
// present. See jneilliii/OctoPrint-Tasmota#192.
ko.bindingHandlers.tasmotaIconpicker = {
    init: function(element, valueAccessor, allBindingsAccessor) {
        //initialize iconpicker with some optional options
        var options = allBindingsAccessor().iconpickerOptions || {};
        var value = ko.utils.unwrapObservable(valueAccessor());
        $(element).attr("data-selected", value);
		$(element).val(value);
        $(element).tasmotaIconpicker(options);

        //handle the field changing
        ko.utils.registerEventHandler(element, "iconpickerSelected", function (event) {
            var observable = valueAccessor();
            observable(event.iconpickerValue);
        });

        //handle disposal (if KO removes by the template binding)
        ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
            $(element).tasmotaIconpicker("destroy");
        });

    },
    //update the control when the view model changes
    update: function(element, valueAccessor) {
        var value = ko.utils.unwrapObservable(valueAccessor());
        $(element).attr("data-selected", value);
		$(element).val(value);
    }
};
